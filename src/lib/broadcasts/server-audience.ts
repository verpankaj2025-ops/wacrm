
import { supabaseAdmin } from "@/lib/automations/admin-client"

export type ServerAudienceConfig = {
  type:
    | "all"
    | "tags"
    | "custom_field"
    | "csv"
  tagIds?: string[]
  customField?: {
    fieldId: string
    operator: "is" | "is_not" | "contains"
    value: string
  }
  csvContacts?: {
    phone: string
    name?: string
  }[]
  excludeTagIds?: string[]
}

export type ServerContact = {
  id: string
  user_id: string
  account_id: string
  phone: string
  name: string | null
  email: string | null
  company: string | null
}

async function fetchContactsByIds(
  accountId: string,
  ids: string[],
) {
  const admin = supabaseAdmin()
  const result: ServerContact[] = []

  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500)
    if (!slice.length) continue

    const { data, error } = await admin
      .from("contacts")
      .select(
        "id,user_id,account_id,phone,name,email,company",
      )
      .eq("account_id", accountId)
      .in("id", slice)

    if (error) throw new Error(error.message)

    result.push(
      ...((data ?? []) as ServerContact[]),
    )
  }

  return result
}

async function upsertCsvContacts(
  accountId: string,
  userId: string,
  rows: {
    phone: string
    name?: string
  }[],
) {
  const admin = supabaseAdmin()

  const unique = new Map<
    string,
    { phone: string; name?: string }
  >()

  for (const row of rows) {
    const phone = String(row.phone ?? "").trim()
    if (phone) unique.set(phone, row)
  }

  const phones = [...unique.keys()]
  if (!phones.length) return [] as ServerContact[]

  const existing: ServerContact[] = []

  for (let i = 0; i < phones.length; i += 500) {
    const slice = phones.slice(i, i + 500)

    const { data, error } = await admin
      .from("contacts")
      .select(
        "id,user_id,account_id,phone,name,email,company",
      )
      .eq("account_id", accountId)
      .in("phone", slice)

    if (error) throw new Error(error.message)

    existing.push(
      ...((data ?? []) as ServerContact[]),
    )
  }

  const existingPhones = new Set(
    existing.map((row) => row.phone),
  )

  const missing = phones
    .filter((phone) => !existingPhones.has(phone))
    .map((phone) => ({
      user_id: userId,
      account_id: accountId,
      phone,
      name: unique.get(phone)?.name ?? null,
    }))

  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200)
    if (!chunk.length) continue

    const { data, error } = await admin
      .from("contacts")
      .insert(chunk)
      .select(
        "id,user_id,account_id,phone,name,email,company",
      )

    if (error) throw new Error(error.message)

    existing.push(
      ...((data ?? []) as ServerContact[]),
    )
  }

  const byPhone = new Map(
    existing.map((row) => [row.phone, row]),
  )

  return phones
    .map((phone) => byPhone.get(phone))
    .filter(
      (row): row is ServerContact =>
        Boolean(row),
    )
}

export async function resolveServerAudience(
  accountId: string,
  userId: string,
  audience: ServerAudienceConfig,
) {
  const admin = supabaseAdmin()
  let contacts: ServerContact[] = []

  if (audience.type === "all") {
    const { data, error } = await admin
      .from("contacts")
      .select(
        "id,user_id,account_id,phone,name,email,company",
      )
      .eq("account_id", accountId)
      .order("created_at", {
        ascending: true,
      })

    if (error) throw new Error(error.message)

    contacts =
      (data ?? []) as ServerContact[]
  } else if (
    audience.type === "tags"
  ) {
    const tagIds = audience.tagIds ?? []

    if (tagIds.length) {
      const { data, error } = await admin
        .from("contact_tags")
        .select("contact_id")
        .in("tag_id", tagIds)

      if (error) throw new Error(error.message)

      const ids = [
        ...new Set(
          (data ?? []).map(
            (row) => row.contact_id,
          ),
        ),
      ]

      contacts =
        await fetchContactsByIds(
          accountId,
          ids,
        )
    }
  } else if (
    audience.type === "custom_field"
  ) {
    const filter = audience.customField

    if (filter) {
      let query = admin
        .from("contact_custom_values")
        .select("contact_id")
        .eq(
          "custom_field_id",
          filter.fieldId,
        )

      if (filter.operator === "is") {
        query = query.eq("value", filter.value)
      } else if (
        filter.operator === "is_not"
      ) {
        query = query.neq("value", filter.value)
      } else {
        query = query.ilike(
          "value",
          `%${filter.value}%`,
        )
      }

      const { data, error } =
        await query

      if (error) throw new Error(error.message)

      contacts =
        await fetchContactsByIds(
          accountId,
          (data ?? []).map(
            (row) => row.contact_id,
          ),
        )
    }
  } else if (
    audience.type === "csv"
  ) {
    contacts =
      await upsertCsvContacts(
        accountId,
        userId,
        audience.csvContacts ?? [],
      )
  }

  const excludeTagIds =
    audience.excludeTagIds ?? []

  if (excludeTagIds.length) {
    const { data, error } = await admin
      .from("contact_tags")
      .select("contact_id")
      .in(
        "tag_id",
        excludeTagIds,
      )

    if (error) throw new Error(error.message)

    const excluded = new Set(
      (data ?? []).map(
        (row) => row.contact_id,
      ),
    )

    contacts = contacts.filter(
      (contact) =>
        !excluded.has(contact.id),
    )
  }

  return contacts
}

export async function resolveTemplateParams(
  accountId: string,
  contacts: ServerContact[],
  variables: Record<string, unknown>,
) {
  const admin = supabaseAdmin()

  const contactIds =
    contacts.map(
      (contact) => contact.id,
    )

  const customValues =
    new Map<
      string,
      Map<string, string>
    >()

  for (
    let i = 0;
    i < contactIds.length;
    i += 500
  ) {
    const slice =
      contactIds.slice(
        i,
        i + 500,
      )

    if (!slice.length) continue

    const { data, error } = await admin
      .from("contact_custom_values")
      .select(
        "contact_id,custom_field_id,value",
      )
      .in(
        "contact_id",
        slice,
      )

    if (error) throw new Error(error.message)

    for (const row of data ?? []) {
      const bucket =
        customValues.get(
          row.contact_id,
        ) ??
        new Map<string, string>()

      bucket.set(
        row.custom_field_id,
        row.value ?? "",
      )

      customValues.set(
        row.contact_id,
        bucket,
      )
    }
  }

  const keys =
    Object.keys(
      variables ?? {},
    ).sort(
      (a, b) =>
        Number(a) -
        Number(b),
    )

  return new Map(
    contacts.map(
      (contact) => {
        const values =
          customValues.get(
            contact.id,
          )

        const params =
          keys.map(
            (key) => {
              const mapping =
                (
                  variables[key] ??
                  {}
                ) as Record<
                  string,
                  unknown
                >

              if (
                mapping.type ===
                "field"
              ) {
                const field =
                  String(
                    mapping.value ??
                      "",
                  )

                return String(
                  (
                    contact as unknown as Record<
                      string,
                      unknown
                    >
                  )[field] ??
                    "",
                )
              }

              if (
                mapping.type ===
                "custom_field"
              ) {
                return (
                  values?.get(
                    String(
                      mapping.value ??
                        "",
                    ),
                  ) ?? ""
                )
              }

              return String(
                mapping.value ??
                  "",
              )
            },
          )

        return [
          contact.id,
          params,
        ] as const
      },
    ),
  )
}

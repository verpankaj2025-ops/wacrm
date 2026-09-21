
const META_API_VERSION = "v21.0"
const META_API_BASE =
  `https://graph.facebook.com/${META_API_VERSION}`

export type MetaTemplateAvailability = {
  exists: boolean
  approved: boolean
  id?: string
  name?: string
  language?: string
  status?: string
}

export async function checkMetaTemplateAvailability(
  args: {
    wabaId: string
    accessToken: string
    name: string
    language: string
  },
): Promise<MetaTemplateAvailability> {
  const {
    wabaId,
    accessToken,
    name,
    language,
  } = args

  const url =
    `${META_API_BASE}/${encodeURIComponent(
      wabaId,
    )}/message_templates` +
    `?name=${encodeURIComponent(name)}` +
    `&limit=100` +
    `&fields=id,name,language,status`

  const response =
    await fetch(
      url,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    )

  const data =
    await response
      .json()
      .catch(
        () => ({}),
      )

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Meta template lookup failed (HTTP ${response.status}).`

    throw new Error(
      message,
    )
  }

  const rows =
    Array.isArray(data?.data)
      ? data.data
      : []

  const exact =
    rows.find(
      (row: {
        name?: string
        language?: string
      }) =>
        row.name === name &&
        row.language === language,
    )

  if (!exact) {
    return {
      exists: false,
      approved: false,
    }
  }

  return {
    exists: true,
    approved:
      exact.status === "APPROVED",
    id: exact.id,
    name: exact.name,
    language: exact.language,
    status: exact.status,
  }
}

export function metaTemplateBroadcastError(
  name: string,
  language: string,
  availability:
    MetaTemplateAvailability,
) {
  if (
    !availability.exists
  ) {
    return (
      `Template "${name}" (${language}) is not currently available ` +
      `on your Meta WhatsApp Business Account. ` +
      `Go to Settings → Templates → Sync from Meta and select a current APPROVED template.`
    )
  }

  if (
    !availability.approved
  ) {
    return (
      `Template "${name}" (${language}) exists on Meta but its current ` +
      `status is "${availability.status}". Only APPROVED templates can be broadcast.`
    )
  }

  return null
}

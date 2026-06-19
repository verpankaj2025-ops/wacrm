import { NextResponse } from "next/server";
import { routeToAI } from "@/lib/ai/router";

export async function POST(request: Request) {

  const body = await request.json();

  const result = await routeToAI(
    body.message ?? "",
  );

  return NextResponse.json(result);
}
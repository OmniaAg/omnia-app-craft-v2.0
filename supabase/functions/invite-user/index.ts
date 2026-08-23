import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"
import { z } from "zod"

const localOrigins = new Set([
  "http://localhost:53170",
  "http://127.0.0.1:53170",
])

const configuredOrigins = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowedOrigins = new Set([...localOrigins, ...configuredOrigins])

const baseInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  idempotencyKey: z.guid(),
}).strict()

const internalInvitationSchema = baseInvitationSchema.extend({
  kind: z.literal("internal"),
  agencyRoleKey: z.enum(["agency_director", "project_manager", "contributor"]),
  departmentKey: z.string().trim().min(2).max(40),
  classification: z.enum([
    "founder",
    "employee",
    "external_collaborator",
    "contractor",
  ]),
}).strict()

const clientInvitationSchema = baseInvitationSchema.extend({
  kind: z.literal("client"),
  organizationId: z.guid(),
  clientRoleKey: z.enum(["client_admin", "client_reviewer", "client_viewer"]),
}).strict()

const invitationSchema = z.discriminatedUnion("kind", [
  internalInvitationSchema,
  clientInvitationSchema,
])

type InvitationResult = {
  invitation_id: string
  normalized_email: string
  invitation_kind: "internal" | "client"
  is_replay: boolean
  was_dispatched: boolean
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "null",
    "Vary": "Origin",
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  return Response.json(body, { status, headers: corsHeaders(origin) })
}

const inviteUser = withSupabase(
  { auth: "user", cors: "disabled" },
  async (request, context) => {
    const origin = request.headers.get("Origin")
    const { data: caller, error: callerError } = await context.supabase.auth.getUser()

    if (callerError || !caller.user) {
      return jsonResponse({ error: "authentication_required" }, 401, origin)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400, origin)
    }

    const parsed = invitationSchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse({ error: "invalid_invitation_input" }, 400, origin)
    }

    const input = parsed.data
    const rpcArguments = input.kind === "internal"
      ? {
          kind: input.kind,
          email: input.email,
          agency_role_key: input.agencyRoleKey,
          department_key: input.departmentKey,
          classification: input.classification,
          organization_id: null,
          client_role_key: null,
          idempotency_key: input.idempotencyKey,
        }
      : {
          kind: input.kind,
          email: input.email,
          agency_role_key: null,
          department_key: null,
          classification: null,
          organization_id: input.organizationId,
          client_role_key: input.clientRoleKey,
          idempotency_key: input.idempotencyKey,
        }

    const { data, error } = await context.supabase.rpc(
      "create_invitation",
      rpcArguments,
    )

    if (error || !data?.[0]) {
      const status = error?.code === "42501" ? 403 : 400
      return jsonResponse(
        { error: status === 403 ? "invitation_forbidden" : "invitation_rejected" },
        status,
        origin,
      )
    }

    const invitation = data[0] as InvitationResult
    if (invitation.was_dispatched) {
      return jsonResponse(
        { invitationId: invitation.invitation_id, replay: true },
        200,
        origin,
      )
    }

    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:53170"
    const redirectUrl = new URL("/accept-invite", appUrl)
    redirectUrl.searchParams.set("invitation", invitation.invitation_id)

    const { error: dispatchError } = await context.supabaseAdmin.auth.admin
      .inviteUserByEmail(invitation.normalized_email, {
        redirectTo: redirectUrl.toString(),
      })

    if (dispatchError) {
      console.error("invite_user_dispatch_failed", {
        code: dispatchError.code,
        status: dispatchError.status,
      })
      return jsonResponse({ error: "invite_dispatch_failed" }, 502, origin)
    }

    const { error: markError } = await context.supabaseAdmin.rpc(
      "mark_invitation_dispatched",
      { invitation_id: invitation.invitation_id },
    )

    if (markError) {
      console.error("invite_user_mark_failed", { code: markError.code })
      return jsonResponse({ error: "invite_state_update_failed" }, 500, origin)
    }

    return jsonResponse(
      { invitationId: invitation.invitation_id, replay: invitation.is_replay },
      invitation.is_replay ? 200 : 201,
      origin,
    )
  },
)

export default {
  fetch(request: Request): Promise<Response> | Response {
    const origin = request.headers.get("Origin")

    if (origin && !allowedOrigins.has(origin)) {
      return jsonResponse({ error: "origin_forbidden" }, 403, origin)
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, origin)
    }

    return inviteUser(request)
  },
}

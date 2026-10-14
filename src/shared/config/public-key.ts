export function assertPublicKey(value: string): void {
  if (value.startsWith('sb_secret_')) throw new Error('Una clave privada de Supabase no puede usarse en el frontend.')
  if (value.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(value.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')))
      if (payload.role !== 'anon') throw new Error()
    } catch { throw new Error('La clave legacy del frontend debe ser anon, nunca service_role.') }
  }
}

import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { AuthLayout } from '../ui/AuthLayout'

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const handleSignOut = async () => {
    setSignOutError(null)
    try {
      await auth.signOut()
      navigate('/login', { replace: true })
    } catch {
      setSignOutError('No pudimos cerrar la sesión. Intenta de nuevo.')
    }
  }

  return (
    <AuthLayout
      title="Este contexto no está disponible"
      description={
        auth.error ??
        'Tu identidad es válida, pero no encontramos una membership activa para esta superficie.'
      }
      contextMessage="Las rutas comunican el resultado; RLS y los comandos del servidor siguen siendo la autoridad."
    >
      <div className="auth-complete auth-complete--error">
        <h2>Acceso denegado</h2>
        <p>
          Si esperabas entrar aquí, pide a la Directora que revise tu invitación
          o membership. Cambiar la URL no amplía tus permisos.
        </p>
        <div className="auth-action-row">
          <Link className="auth-secondary-action" to="/">
            Resolver mi contexto
          </Link>
          {auth.status === 'authenticated' ? (
            <button type="button" className="auth-text-button" onClick={handleSignOut}>
              Cerrar sesión
            </button>
          ) : (
            <Link className="auth-text-link" to="/login">
              Volver al acceso
            </Link>
          )}
        </div>
        {signOutError ? (
          <p className="auth-field__error" role="alert">
            {signOutError}
          </p>
        ) : null}
      </div>
    </AuthLayout>
  )
}

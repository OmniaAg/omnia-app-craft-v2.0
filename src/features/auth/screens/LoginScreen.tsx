import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthFlowError } from '../api/auth-service'
import { useAuth } from '../context/AuthContext'
import { routeAfterSignIn } from '../model/authorization'
import { loginSchema, type LoginInput } from '../model/schemas'
import { safePushPath } from '../../pwa/notification-destination'
import {
  AuthLayout,
  AuthSubmitButton,
  FieldError,
  PasswordInput,
} from '../ui/AuthLayout'

export function Component() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  })

  if (auth.status === 'authenticated' && auth.actor) {
    return <Navigate to={routeAfterSignIn(auth.actor,safePushPath(location.state?.from) ? location.state.from : undefined)} replace />
  }

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null)
    try {
      const requestedPath =
        typeof location.state === 'object' &&
        location.state !== null &&
        'from' in location.state &&
        (location.state.from === '/app' || location.state.from === '/portal' || safePushPath(location.state.from))
          ? location.state.from
          : undefined
      const destination = await auth.signIn(
        input.email,
        input.password,
        requestedPath,
      )
      navigate(destination, { replace: true })
    } catch (error) {
      setFormError(
        error instanceof AuthFlowError
          ? error.message
          : 'No pudimos iniciar la sesión. Intenta de nuevo.',
      )
    }
  })

  return (
    <AuthLayout
      title="Vuelve a tu espacio"
      description="Tu sesión abre únicamente los contextos que tus memberships autorizan."
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="login-email">Correo</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            {...register('email')}
          />
          <FieldError id="login-email-error" message={errors.email?.message} />
        </div>

        <div className="auth-field">
          <div className="auth-field__label-row">
            <label htmlFor="login-password">Contraseña</label>
            <Link to="/forgot-password">¿La olvidaste?</Link>
          </div>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={
              errors.password ? 'login-password-error' : undefined
            }
            {...register('password')}
          />
          <FieldError
            id="login-password-error"
            message={errors.password?.message}
          />
        </div>

        {formError ? (
          <div className="auth-message auth-message--error" role="alert">
            {formError}
          </div>
        ) : null}

        <AuthSubmitButton
          idleLabel="Entrar a OMNIA"
          pendingLabel="Verificando acceso…"
          pending={isSubmitting || auth.status === 'loading'}
        />
      </form>
    </AuthLayout>
  )
}

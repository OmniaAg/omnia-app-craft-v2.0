import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthFlowError } from '../api/auth-service'
import { useAuth } from '../context/AuthContext'
import {
  invitationIdSchema,
  newPasswordSchema,
  type NewPasswordInput,
} from '../model/schemas'
import {
  AuthLayout,
  AuthSubmitButton,
  FieldError,
  PasswordInput,
} from '../ui/AuthLayout'
import { AuthStatusView } from '../ui/AuthStatusView'

export function Component() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const invitationResult = invitationIdSchema.safeParse(
    searchParams.get('invitation'),
  )
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    mode: 'onBlur',
    defaultValues: { password: '', confirmPassword: '' },
  })

  if (auth.status === 'loading') {
    return <AuthStatusView title="Verificando tu invitación" />
  }

  const canAccept =
    auth.status === 'authenticated' && invitationResult.success

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!invitationResult.success) {
      return
    }

    setFormError(null)
    try {
      const destination = await auth.acceptInvite(
        invitationResult.data,
        password,
      )
      navigate(destination, { replace: true })
    } catch (error) {
      setFormError(
        error instanceof AuthFlowError
          ? error.message
          : 'No pudimos aceptar la invitación.',
      )
    }
  })

  return (
    <AuthLayout
      title="Activa tu acceso"
      description="La invitación define el rol y scope en el servidor. Tú sólo eliges la contraseña."
      contextMessage="La autoridad de esta invitación no proviene del enlace ni de metadata editable: se revalida en PostgreSQL."
    >
      {!canAccept ? (
        <div className="auth-complete auth-complete--error" role="alert">
          <h2>La invitación no está disponible</h2>
          <p>
            Abre el enlace original de Mailpit. Si ya expiró o fue utilizado,
            solicita una invitación nueva.
          </p>
          <Link className="auth-secondary-action" to="/login">
            Ir al acceso
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="invite-password">Crea tu contraseña</label>
            <PasswordInput
              id="invite-password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password
                  ? 'invite-password-help invite-password-error'
                  : 'invite-password-help'
              }
              {...register('password')}
            />
            <span id="invite-password-help" className="auth-field__help">
              10 caracteres o más, con mayúscula, minúscula y número.
            </span>
            <FieldError
              id="invite-password-error"
              message={errors.password?.message}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="invite-password-confirmation">
              Confirma la contraseña
            </label>
            <PasswordInput
              id="invite-password-confirmation"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={
                errors.confirmPassword
                  ? 'invite-password-confirmation-error'
                  : undefined
              }
              {...register('confirmPassword')}
            />
            <FieldError
              id="invite-password-confirmation-error"
              message={errors.confirmPassword?.message}
            />
          </div>

          {formError ? (
            <div className="auth-message auth-message--error" role="alert">
              {formError}
            </div>
          ) : null}

          <AuthSubmitButton
            idleLabel="Aceptar invitación"
            pendingLabel="Activando acceso…"
            pending={isSubmitting}
          />
        </form>
      )}
    </AuthLayout>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { AuthFlowError } from '../api/auth-service'
import { useAuth } from '../context/AuthContext'
import { recoverySchema, type RecoveryInput } from '../model/schemas'
import {
  AuthLayout,
  AuthSubmitButton,
  FieldError,
} from '../ui/AuthLayout'

export function Component() {
  const auth = useAuth()
  const [complete, setComplete] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecoveryInput>({
    resolver: zodResolver(recoverySchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null)
    try {
      await auth.sendRecovery(email)
      setComplete(true)
    } catch (error) {
      setFormError(
        error instanceof AuthFlowError
          ? error.message
          : 'No pudimos iniciar la recuperación. Intenta de nuevo.',
      )
    }
  })

  return (
    <AuthLayout
      title="Recupera tu acceso"
      description="Te enviaremos un enlace local para elegir una contraseña nueva."
      contextMessage="Los mensajes de recuperación se capturan en Mailpit durante el desarrollo local."
    >
      {complete ? (
        <div className="auth-complete" role="status">
          <h2>Revisa tu bandeja local</h2>
          <p>
            Si el correo corresponde a una cuenta, encontrarás el enlace en
            Mailpit. Esta respuesta no confirma si el usuario existe.
          </p>
          <Link className="auth-secondary-action" to="/login">
            Volver al acceso
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="recovery-email">Correo</label>
            <input
              id="recovery-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? 'recovery-email-error' : 'recovery-email-help'
              }
              {...register('email')}
            />
            <span id="recovery-email-help" className="auth-field__help">
              Usa el mismo correo con el que recibiste tu invitación.
            </span>
            <FieldError
              id="recovery-email-error"
              message={errors.email?.message}
            />
          </div>

          {formError ? (
            <div className="auth-message auth-message--error" role="alert">
              {formError}
            </div>
          ) : null}

          <AuthSubmitButton
            idleLabel="Enviar enlace"
            pendingLabel="Solicitando enlace…"
            pending={isSubmitting}
          />
          <Link className="auth-text-link" to="/login">
            Volver al acceso
          </Link>
        </form>
      )}
    </AuthLayout>
  )
}

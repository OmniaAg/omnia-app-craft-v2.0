import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { AuthFlowError } from '../api/auth-service'
import { useAuth } from '../context/AuthContext'
import {
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
  const [formError, setFormError] = useState<string | null>(null)
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
    return <AuthStatusView title="Validando el enlace de recuperación" />
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null)
    try {
      const destination = await auth.savePassword(password)
      navigate(destination, { replace: true })
    } catch (error) {
      setFormError(
        error instanceof AuthFlowError
          ? error.message
          : 'No pudimos guardar la nueva contraseña.',
      )
    }
  })

  return (
    <AuthLayout
      title="Elige una contraseña nueva"
      description="El enlace debe abrir una sesión de recuperación válida antes de guardar el cambio."
    >
      {auth.status !== 'authenticated' ? (
        <div className="auth-complete auth-complete--error" role="alert">
          <h2>El enlace no está activo</h2>
          <p>
            Abre nuevamente el enlace de Mailpit o solicita una recuperación
            nueva.
          </p>
          <Link className="auth-secondary-action" to="/forgot-password">
            Solicitar otro enlace
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="new-password">Contraseña nueva</label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password
                  ? 'new-password-help new-password-error'
                  : 'new-password-help'
              }
              {...register('password')}
            />
            <span id="new-password-help" className="auth-field__help">
              10 caracteres o más, con mayúscula, minúscula y número.
            </span>
            <FieldError
              id="new-password-error"
              message={errors.password?.message}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="confirm-password">Confirma la contraseña</label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={
                errors.confirmPassword
                  ? 'confirm-password-error'
                  : undefined
              }
              {...register('confirmPassword')}
            />
            <FieldError
              id="confirm-password-error"
              message={errors.confirmPassword?.message}
            />
          </div>

          {formError ? (
            <div className="auth-message auth-message--error" role="alert">
              {formError}
            </div>
          ) : null}

          <AuthSubmitButton
            idleLabel="Guardar contraseña"
            pendingLabel="Guardando…"
            pending={isSubmitting}
          />
        </form>
      )}
    </AuthLayout>
  )
}

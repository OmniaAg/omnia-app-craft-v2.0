import { useState, type ComponentPropsWithRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import omniaLogo from '../../../assets/images/brand/logos_omnia/OMNIA_Version_fullblanco.webp'
import './auth.css'

type AuthLayoutProps = {
  title: string
  description: string
  children: ReactNode
  contextMessage?: string
}

export function AuthLayout({
  title,
  description,
  children,
  contextMessage = 'Un acceso. Dos contextos aislados. Autoridad verificada en cada operación.',
}: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <a className="skip-link" href="#auth-form">
        Saltar al formulario
      </a>
      <section className="auth-brand" aria-label="OMNIA Craft">
        <Link to="/" className="auth-brand__logo" aria-label="OMNIA Craft, inicio">
          <img src={omniaLogo} width="181" height="46" alt="OMNIA" />
          <span>Craft</span>
        </Link>
        <p>{contextMessage}</p>
        <div className="auth-brand__signal" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>

      <section id="auth-form" className="auth-panel" tabIndex={-1}>
        <div className="auth-panel__content">
          <h1 data-route-heading tabIndex={-1}>{title}</h1>
          <p className="auth-panel__description">{description}</p>
          {children}
        </div>
        <p className="auth-panel__footer">
          OMNIA Craft 2.0 · Identidad y autorización
        </p>
      </section>
    </main>
  )
}

type FieldErrorProps = {
  id: string
  message?: string
}

export function FieldError({ id, message }: FieldErrorProps) {
  return message ? (
    <span id={id} className="auth-field__error" role="alert">
      {message}
    </span>
  ) : null
}

type PasswordInputProps = Omit<ComponentPropsWithRef<'input'>, 'type'>

export function PasswordInput({ id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="auth-password-control">
      <input id={id} type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        aria-controls={id}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  )
}

type AuthSubmitButtonProps = {
  idleLabel: string
  pendingLabel: string
  pending: boolean
}

export function AuthSubmitButton({
  idleLabel,
  pendingLabel,
  pending,
}: AuthSubmitButtonProps) {
  return (
    <button
      className="auth-submit"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}

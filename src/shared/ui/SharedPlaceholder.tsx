import { Link } from 'react-router-dom'
import omniaMark from '../../assets/images/brand/logos_omnia/OMNIA_Version_isotipo.webp'

type SharedPlaceholderProps = {
  title: string
  description: string
  actionHref: string
  actionLabel: string
}

export function SharedPlaceholder({
  title,
  description,
  actionHref,
  actionLabel,
}: SharedPlaceholderProps) {
  return (
    <main className="shared-placeholder">
      <img src={omniaMark} width="72" height="72" alt="" />
      <h1 data-route-heading tabIndex={-1}>{title}</h1>
      <p>{description}</p>
      <Link className="primary-link" to={actionHref}>
        {actionLabel}
      </Link>
    </main>
  )
}

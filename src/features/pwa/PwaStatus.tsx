import { applyUpdate, usePwaStatus } from './runtime'
import { useConnectivity } from './connectivity'
import './pwa.css'
export function PwaStatus() {
  const network=useConnectivity()
  const pwa=usePwaStatus()
  return <div className="pwa-status">
    {!network.online ? <p role="status">Estás sin conexión. Los datos visibles pueden estar desactualizados. Las acciones necesitan conexión.</p>
      : network.degraded ? <p role="status">No pudimos conectar con el servidor. Comprueba tu red y vuelve a intentar.</p> : null}
    {pwa.waiting ? <div className="pwa-update"><span role="status">Hay una actualización disponible.</span>
      <button type="button" onClick={applyUpdate}>Actualizar aplicación</button></div> : null}
  </div>
}

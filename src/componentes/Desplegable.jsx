/**
 * Lo que se abre y se cierra con suavidad: la altura crece de cero a lo que
 * mida el contenido (index.css, .desplegable). Cerrado sigue en la pagina
 * pero no se puede tocar ni lo lee el lector de pantalla (inert).
 */
export default function Desplegable({ abierto, id, children }) {
  return (
    <div className="desplegable" data-abierto={abierto} id={id} inert={!abierto}>
      <div>{children}</div>
    </div>
  )
}

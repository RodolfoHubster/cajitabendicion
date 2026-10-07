# La imagen que se ve al compartir el enlace (Facebook, WhatsApp): 1200 x 630.
#
# El dibujo de fondo lo hizo Gemini SIN letras (docs/imagenes/vista-previa-fondo.png);
# aqui se le pone el logo real y el texto exacto, para que no salgan letras
# mal escritas. Si cambia el texto, se cambia aqui y se vuelve a correr:
#
#   powershell -ExecutionPolicy Bypass -File scripts/vista-previa.ps1
#
# Sale public/vista-previa.png (la usa index.html, en og:image).
param(
  [string]$Raiz = (Split-Path -Parent $PSScriptRoot)
)

Add-Type -AssemblyName System.Drawing

$fondo = Join-Path $Raiz 'docs\imagenes\vista-previa-fondo.png'
$logo = Join-Path $Raiz 'public\logos\cajita-bendicion.jpg'
$salida = Join-Path $Raiz 'public\vista-previa.png'

$ANCHO = 1200
$ALTO = 630
$AZUL = [System.Drawing.Color]::FromArgb(27, 58, 107)       # #1B3A6B
$NARANJA = [System.Drawing.Color]::FromArgb(245, 160, 60)   # #F5A03C
$GRIS_AZUL = [System.Drawing.Color]::FromArgb(74, 95, 133)  # #4A5F85
$IZQUIERDA = 64
$MAXIMO = 500   # la caja del dibujo empieza como en x = 590

$lienzo = New-Object System.Drawing.Bitmap($ANCHO, $ALTO)
$g = [System.Drawing.Graphics]::FromImage($lienzo)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# El fondo, cubriendo todo (se recorta lo que sobre arriba y abajo).
$imagenFondo = [System.Drawing.Image]::FromFile($fondo)
$escala = [Math]::Max($ANCHO / $imagenFondo.Width, $ALTO / $imagenFondo.Height)
$w = [int]($imagenFondo.Width * $escala)
$h = [int]($imagenFondo.Height * $escala)
$g.DrawImage($imagenFondo, [int](($ANCHO - $w) / 2), [int](($ALTO - $h) / 2), $w, $h)
$imagenFondo.Dispose()

# El logo, en un circulo blanco (sin las esquinas blancas del cuadro).
$diametro = 172
$imagenLogo = [System.Drawing.Image]::FromFile($logo)
$circulo = New-Object System.Drawing.Drawing2D.GraphicsPath
$circulo.AddEllipse($IZQUIERDA, 34, $diametro, $diametro)
$g.FillPath([System.Drawing.Brushes]::White, $circulo)
$g.SetClip($circulo)
# Todo el cuadro del logo, recortado al circulo: el texto de abajo (Iglesia
# Casa de Alabanza) queda dentro, y el blanco de la orilla se junta con el circulo.
$g.DrawImage($imagenLogo, $IZQUIERDA, 34, $diametro, $diametro)
$g.ResetClip()
$imagenLogo.Dispose()

$formato = [System.Drawing.StringFormat]::GenericTypographic

# Escribe en una linea; si no cabe en $MAXIMO, baja la letra. Devuelve donde termina.
function Escribir($texto, $familia, $estilo, $tamano, $color, $y) {
  do {
    $letra = New-Object System.Drawing.Font($familia, [single]$tamano, $estilo, [System.Drawing.GraphicsUnit]::Pixel)
    $medida = $g.MeasureString($texto, $letra, 2000, $formato)
    if ($medida.Width -le $MAXIMO) { break }
    $letra.Dispose()
    $tamano -= 1
  } while ($tamano -gt 12)
  $pincel = New-Object System.Drawing.SolidBrush($color)
  $g.DrawString($texto, $letra, $pincel, [single]$IZQUIERDA, [single]$y, $formato)
  $pincel.Dispose()
  $letra.Dispose()
  return $y + $medida.Height
}

$negrita = [System.Drawing.FontStyle]::Bold
$normal = [System.Drawing.FontStyle]::Regular

$y = Escribir 'Saca tu cita' 'Rockwell' $negrita 72 $AZUL 226
$y = Escribir 'gratis' 'Rockwell' $negrita 72 $AZUL ($y - 6)
$y = Escribir 'Get your free appointment' 'Segoe UI Semibold' $normal 32 $GRIS_AZUL ($y + 10)

# La rayita naranja.
$naranja = New-Object System.Drawing.SolidBrush($NARANJA)
$g.FillRectangle($naranja, $IZQUIERDA, [int]($y + 22), 72, 7)
$naranja.Dispose()

#  El punto medio con su codigo: PowerShell 5 lee mal los acentos de un .ps1.
$punto = [char]0x00B7
$y = Escribir "Lunes y jueves $punto Mondays & Thursdays" 'Segoe UI' $negrita 30 $AZUL ($y + 46)
$null = Escribir 'citas.casadealabanzasd.com' 'Segoe UI Semibold' $normal 26 $GRIS_AZUL 560

$g.Dispose()
$temporal = "$salida.nuevo.png"
$lienzo.Save($temporal, [System.Drawing.Imaging.ImageFormat]::Png)
$lienzo.Dispose()
Move-Item -Force $temporal $salida
"Listo: $salida"

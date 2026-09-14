# Genera public/favicon.ico y public/apple-touch-icon.png.
#
# Parte del logo circular de Cajita de Bendicion (public/logos/cajita-bendicion.jpg).
# Para el favicon lo recorta en circulo con las esquinas transparentes, asi
# no aparece un cuadro blanco en las pestanas con fondo oscuro.
#
# Si el logo no existe, dibuja un techo provisional con el naranja del logo.
# No necesita instalar nada: usa System.Drawing, que ya viene con Windows.
#
# Uso, desde la carpeta del proyecto:
#   powershell -ExecutionPolicy Bypass -File scripts/generar-favicon.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$proyecto = Split-Path -Parent $PSScriptRoot
$origen = Join-Path $proyecto 'public\logos\cajita-bendicion.jpg'
$destinoIco = Join-Path $proyecto 'public\favicon.ico'
$destinoApple = Join-Path $proyecto 'public\apple-touch-icon.png'

$script:fuente = $null
if (Test-Path $origen) {
  $script:fuente = [System.Drawing.Image]::FromFile($origen)
  Write-Output "Usando el logo: $origen"
} else {
  Write-Output "No existe $origen. Se dibuja un techo provisional."
}

function Nuevo-Icono {
  param([int]$Lado, [System.Drawing.Color]$Fondo, [double]$Margen = 0.0, [switch]$Circular)

  $bmp = New-Object System.Drawing.Bitmap($Lado, $Lado, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear($Fondo)

  if ($script:fuente) {
    $borde = [int][Math]::Round($Lado * $Margen)
    $area = $Lado - 2 * $borde

    # Copia del logo ya reducida. Se amplia un 3% para que el recorte
    # circular caiga justo sobre el aro azul y no deje un halo blanco.
    $reducida = New-Object System.Drawing.Bitmap($area, $area, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gr = [System.Drawing.Graphics]::FromImage($reducida)
    $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $extra = if ($Circular) { [int][Math]::Round($area * 0.03) } else { 0 }
    $gr.DrawImage($script:fuente, -$extra, -$extra, $area + 2 * $extra, $area + 2 * $extra)
    $gr.Dispose()

    if ($Circular) {
      # Relleno eliptico con la imagen como textura: bordes suavizados, a
      # diferencia de un recorte con SetClip, que queda dentado en 16 px.
      $pincel = New-Object System.Drawing.TextureBrush($reducida)
      $pincel.TranslateTransform($borde, $borde)
      $g.FillEllipse($pincel, $borde, $borde, $area, $area)
      $pincel.Dispose()
    } else {
      $g.DrawImage($reducida, $borde, $borde, $area, $area)
    }

    $reducida.Dispose()
  } else {
    # Techo provisional: mismas proporciones que public/favicon.svg (64x64).
    $naranja = [System.Drawing.Color]::FromArgb(255, 245, 160, 60)
    $s = $Lado / 64.0
    $pluma = New-Object System.Drawing.Pen($naranja, [single]([Math]::Max(1.5, 7 * $s)))
    $pluma.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pluma.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pluma.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $puntos = [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF([single](6 * $s), [single](46 * $s))),
      (New-Object System.Drawing.PointF([single](32 * $s), [single](20 * $s))),
      (New-Object System.Drawing.PointF([single](58 * $s), [single](46 * $s)))
    )
    $g.DrawLines($pluma, $puntos)
    $g.DrawLine($pluma, [single](16 * $s), [single](36 * $s), [single](16 * $s), [single](24 * $s))
    $pluma.Dispose()
  }

  $g.Dispose()
  return $bmp
}

function A-Png {
  param([System.Drawing.Bitmap]$Imagen)

  $flujo = New-Object System.IO.MemoryStream
  $Imagen.Save($flujo, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $flujo.ToArray()
  $flujo.Dispose()
  return ,$bytes
}

# --- favicon.ico: varias medidas en un solo archivo ---
$tamanos = @(16, 32, 48, 256)
$imagenes = @()
foreach ($t in $tamanos) {
  $bmp = Nuevo-Icono -Lado $t -Fondo ([System.Drawing.Color]::Transparent) -Circular
  $imagenes += ,(A-Png $bmp)
  $bmp.Dispose()
}

$archivo = [System.IO.File]::Create($destinoIco)
$escritor = New-Object System.IO.BinaryWriter($archivo)

# Encabezado ICO: reservado, tipo 1 (icono), cantidad de imagenes.
$escritor.Write([UInt16]0)
$escritor.Write([UInt16]1)
$escritor.Write([UInt16]$tamanos.Count)

$desplazamiento = 6 + 16 * $tamanos.Count
for ($i = 0; $i -lt $tamanos.Count; $i++) {
  $lado = $tamanos[$i]
  $bytes = $imagenes[$i]
  # En el formato ICO, 256 px se escribe como 0.
  $medida = if ($lado -ge 256) { 0 } else { $lado }
  $escritor.Write([byte]$medida)
  $escritor.Write([byte]$medida)
  $escritor.Write([byte]0)
  $escritor.Write([byte]0)
  $escritor.Write([UInt16]1)
  $escritor.Write([UInt16]32)
  $escritor.Write([UInt32]$bytes.Length)
  $escritor.Write([UInt32]$desplazamiento)
  $desplazamiento += $bytes.Length
}
foreach ($bytes in $imagenes) {
  $escritor.Write([byte[]]$bytes)
}
$escritor.Close()

# --- apple-touch-icon.png: fondo blanco (el iPhone no admite transparencia
# y redondea las esquinas por su cuenta) ---
$apple = Nuevo-Icono -Lado 180 -Fondo ([System.Drawing.Color]::White) -Margen 0.04
$apple.Save($destinoApple, [System.Drawing.Imaging.ImageFormat]::Png)
$apple.Dispose()

if ($script:fuente) { $script:fuente.Dispose() }

Write-Output "Listo: $destinoIco ($((Get-Item $destinoIco).Length) bytes)"
Write-Output "Listo: $destinoApple ($((Get-Item $destinoApple).Length) bytes)"

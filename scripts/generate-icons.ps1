# Genera los iconos y la imagen de arranque de Rutiva (mismo dibujo que src/ui/Logo.tsx).
# Uso: powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
Add-Type -AssemblyName System.Drawing

$assets = Join-Path $PSScriptRoot '..\assets'
$brandA = [System.Drawing.Color]::FromArgb(255, 0x74, 0x72, 0xF0)
$brandB = [System.Drawing.Color]::FromArgb(255, 0x4B, 0x48, 0xC2)
$white = [System.Drawing.Color]::White

function New-Canvas([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  return @($bmp, $g)
}

function RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# Dibuja anillo + check (coordenadas del viewBox 0..100) escalado y desplazado.
function Draw-Mark($g, [float]$scale, [float]$ox, [float]$oy, $color) {
  $w = 8 * $scale
  $track = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(72, $color.R, $color.G, $color.B)), $w
  $pen = New-Object System.Drawing.Pen $color, $w
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $r = 27 * $scale
  $cx = $ox + 50 * $scale
  $cy = $oy + 50 * $scale
  $g.DrawEllipse($track, $cx - $r, $cy - $r, 2 * $r, 2 * $r)
  # Arco de 270° desde arriba (-90°) en sentido horario.
  $g.DrawArc($pen, $cx - $r, $cy - $r, 2 * $r, 2 * $r, -90, 270)
  $pts = @(
    (New-Object System.Drawing.PointF ($ox + 38 * $scale), ($oy + 51 * $scale)),
    (New-Object System.Drawing.PointF ($ox + 47 * $scale), ($oy + 60 * $scale)),
    (New-Object System.Drawing.PointF ($ox + 63 * $scale), ($oy + 42 * $scale))
  )
  $g.DrawLines($pen, $pts)
}

function Fill-Brand($g, [float]$x, [float]$y, [float]$size, [float]$radius) {
  $rect = New-Object System.Drawing.RectangleF $x, $y, $size, $size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $brandA, $brandB, 45
  if ($radius -gt 0) { $g.FillPath($brush, (RoundedRect $x $y $size $size $radius)) } else { $g.FillRectangle($brush, $rect) }
}

function Save($bmp, $name) {
  $bmp.Save((Join-Path $assets $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "assets/$name"
}

# icon.png (iOS y general): cuadrado completo, sin transparencia.
$c = New-Canvas 1024; Fill-Brand $c[1] 0 0 1024 0; Draw-Mark $c[1] 10.24 0 0 $white; Save $c[0] 'icon.png'

# splash-icon.png: logo redondeado sobre transparente (el fondo lo pone app.json).
$c = New-Canvas 1024; Fill-Brand $c[1] 112 112 800 192; Draw-Mark $c[1] 8 112 112 $white; Save $c[0] 'splash-icon.png'

# Android adaptativo: la marca dentro de la zona segura (66 %).
$c = New-Canvas 1024; Draw-Mark $c[1] 6.4 192 192 $white; Save $c[0] 'android-icon-foreground.png'
$c = New-Canvas 1024; Fill-Brand $c[1] 0 0 1024 0; Save $c[0] 'android-icon-background.png'
$c = New-Canvas 1024; Draw-Mark $c[1] 6.4 192 192 $white; Save $c[0] 'android-icon-monochrome.png'

# favicon.png (web).
$c = New-Canvas 64; Fill-Brand $c[1] 0 0 64 15; Draw-Mark $c[1] 0.64 0 0 $white; Save $c[0] 'favicon.png'

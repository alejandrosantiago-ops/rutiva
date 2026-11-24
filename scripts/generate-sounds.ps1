# Genera los sonidos del despertador (WAV PCM 16 bits, mono, 22 050 Hz, 25 s).
# Son tonos sintetizados propios: no usan audio de terceros.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/generate-sounds.ps1
$ErrorActionPreference = 'Stop'
$outDir = Join-Path $PSScriptRoot '..\assets\sounds'
New-Item -ItemType Directory -Force $outDir | Out-Null

$rate = 22050
$seconds = 25

function Write-Wav([string]$name, [double[]]$samples) {
  $path = Join-Path $outDir $name
  $fs = [System.IO.File]::Create($path)
  $bw = New-Object System.IO.BinaryWriter $fs
  $dataBytes = $samples.Length * 2
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF')); $bw.Write([int](36 + $dataBytes))
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes('WAVE'))
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes('fmt ')); $bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1)
  $bw.Write([int]$rate); $bw.Write([int]($rate * 2)); $bw.Write([int16]2); $bw.Write([int16]16)
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes('data')); $bw.Write([int]$dataBytes)
  foreach ($s in $samples) {
    $v = [Math]::Max(-1.0, [Math]::Min(1.0, $s))
    $bw.Write([int16]([Math]::Round($v * 30000)))
  }
  $bw.Close(); $fs.Close()
  Write-Output "assets/sounds/$name"
}

$n = $rate * $seconds
$twoPi = 2 * [Math]::PI

# Clásica: "bip-bip-bip-bip" a 880 Hz, pausa, y vuelve a empezar.
$classic = New-Object double[] $n
for ($i = 0; $i -lt $n; $i++) {
  $t = $i / $rate
  $cycle = $t % 1.3
  $beep = [Math]::Floor($cycle / 0.2)
  $inBeep = ($beep -lt 4) -and (($cycle % 0.2) -lt 0.12)
  if ($inBeep) {
    $local = $cycle % 0.2
    $env = [Math]::Min(1, $local / 0.005) * [Math]::Min(1, (0.12 - $local) / 0.01)
    $classic[$i] = 0.8 * $env * ([Math]::Sin($twoPi * 880 * $t) + 0.3 * [Math]::Sin($twoPi * 1760 * $t)) / 1.3
  }
}
Write-Wav 'alarm_classic.wav' $classic

# Suave: arpegio de campanas (Do-Mi-Sol-Do) con volumen creciente.
$soft = New-Object double[] $n
$notes = @(523.25, 659.25, 783.99, 1046.5)
for ($i = 0; $i -lt $n; $i++) {
  $t = $i / $rate
  $cycle = $t % 2.4
  $idx = [Math]::Floor($cycle / 0.45)
  if ($idx -lt 4) {
    $local = $cycle - $idx * 0.45
    $f = $notes[$idx]
    $env = [Math]::Exp(-3.2 * $local) * [Math]::Min(1, $local / 0.01)
    $gain = 0.25 + 0.6 * [Math]::Min(1, $t / 15)
    $soft[$i] = $gain * $env * ([Math]::Sin($twoPi * $f * $t) + 0.4 * [Math]::Sin($twoPi * 2 * $f * $t)) / 1.4
  }
}
Write-Wav 'alarm_soft.wav' $soft

# Digital: alternancia rápida de 1000 y 1250 Hz en ráfagas.
$digital = New-Object double[] $n
for ($i = 0; $i -lt $n; $i++) {
  $t = $i / $rate
  $cycle = $t % 1.0
  if ($cycle -lt 0.5) {
    $f = if ((([Math]::Floor($cycle / 0.0625)) % 2) -eq 0) { 1000 } else { 1250 }
    $square = [Math]::Sign([Math]::Sin($twoPi * $f * $t))
    $env = [Math]::Min(1, $cycle / 0.005) * [Math]::Min(1, (0.5 - $cycle) / 0.01)
    $digital[$i] = 0.45 * $env * $square
  }
}
Write-Wav 'alarm_digital.wav' $digital

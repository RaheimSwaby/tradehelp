param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'tradehelp-tiktok-promo-v2.mp4')
)

$ErrorActionPreference = 'Stop'

$ffmpeg = 'C:\Users\Rahei\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe'
$captures = Join-Path $PSScriptRoot 'captures'
$renderDir = Join-Path $env:TEMP 'tradehelp-tiktok-promo-v2-render'

if (-not (Test-Path -LiteralPath $ffmpeg)) {
  throw "FFmpeg was not found at $ffmpeg"
}

New-Item -ItemType Directory -Force -Path $renderDir | Out-Null

$segments = @(
  @{
    Input = 'tradehelp-production-journal.png'
    Line1 = 'STOP GUESSING.'
    Line2 = 'START REVIEWING.'
    Sub = 'LOG THE SETUP / TRACK THE EMOTION / REVIEW THE EXECUTION'
    Number = '01 / 05'
  },
  @{
    Input = 'tradehelp-production-trade-mode.png'
    Line1 = 'PREPARE BEFORE'
    Line2 = 'THE CLICK.'
    Sub = 'PLANS / RULES / DAILY LIMITS'
    Number = '02 / 05'
  },
  @{
    Input = 'tradehelp-production-current.png'
    Line1 = 'SEE WHAT KEEPS'
    Line2 = 'HAPPENING.'
    Sub = 'REVIEW THE PATTERN / NOT JUST THE P&L'
    Number = '03 / 05'
  },
  @{
    Input = 'tradehelp-production-coach.png'
    Line1 = 'ASK BETTER'
    Line2 = 'QUESTIONS.'
    Sub = 'AI COACH / PROCESS REVIEW / NO SIGNALS'
    Number = '04 / 05'
  },
  @{
    Input = 'tradehelp-production-current.png'
    Line1 = 'TRADEHELP'
    Line2 = 'JOURNAL / REVIEW / IMPROVE'
    Sub = 'BUILD A CLEANER PROCESS.'
    Number = 'AVAILABLE NOW'
    EndCard = $true
  }
)

function Escape-DrawText([string]$Text) {
  return $Text.Replace('\', '\\').Replace(':', '\:').Replace("'", "\'").Replace('%', '\%')
}

for ($index = 0; $index -lt $segments.Count; $index++) {
  $segment = $segments[$index]
  $inputPath = Join-Path $captures $segment.Input
  if (-not (Test-Path -LiteralPath $inputPath)) {
    throw "Missing production capture: $inputPath"
  }

  $line1 = Escape-DrawText $segment.Line1
  $line2 = Escape-DrawText $segment.Line2
  $sub = Escape-DrawText $segment.Sub
  $number = Escape-DrawText $segment.Number
  $segmentPath = Join-Path $renderDir ('segment-{0:D2}.mp4' -f ($index + 1))

  if ($segment.EndCard) {
    $headlineSize = 112
    $line1Y = 255
    $line2Y = 410
    $line2Size = 39
    $subY = 500
    $overlayShade = '0x020806@0.78'
  } else {
    $headlineSize = 78
    $line1Y = 215
    $line2Y = 305
    $line2Size = 78
    $subY = 425
    $overlayShade = '0x020806@0.16'
  }

  $filter = @"
crop=1184:704:8:57,
split=2[bg][fg];
[bg]scale=1080:1920:force_original_aspect_ratio=increase,
crop=1080:1920,
gblur=sigma=34,
eq=brightness=-0.54:saturation=0.68[bgv];
[fg]zoompan=z='min(zoom+0.00055,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1000x594:fps=30[fgv];
[bgv]drawbox=x=0:y=0:w=1080:h=1920:color=0x00140d@0.30:t=fill,
drawbox=x=0:y=0:w=1080:h=1920:color=${overlayShade}:t=fill,
drawbox=x=38:y=648:w=1004:h=598:color=0x42f5ab@0.30:t=2[base];
[base][fgv]overlay=x=40:y=650,
drawbox=x=0:y=0:w=12:h=1920:color=0x42f5ab@0.85:t=fill,
drawbox=x=70:y=167:w=70:h=5:color=0x42f5ab@0.95:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='TRADEHELP // PROCESS FIRST':fontcolor=0x42f5ab:fontsize=24:x=70:y=115,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='$line1':fontcolor=0xf3fff9:fontsize=${headlineSize}:x=70:y=${line1Y}:shadowcolor=black@0.65:shadowx=3:shadowy=3,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='$line2':fontcolor=0x42f5ab:fontsize=${line2Size}:x=70:y=${line2Y}:shadowcolor=black@0.65:shadowx=3:shadowy=3,
drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='$sub':fontcolor=0xccecdf:fontsize=27:x=72:y=${subY},
drawbox=x=70:y=1575:w=940:h=2:color=0x42f5ab@0.32:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='$number':fontcolor=0x42f5ab:fontsize=23:x=70:y=1605,
drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='EDUCATIONAL JOURNALING TOOL / NOT FINANCIAL ADVICE / TRADING INVOLVES RISK / 18+':fontcolor=0x9ab9ac:fontsize=18:x=70:y=1765,
fade=t=in:st=0:d=0.16,
fade=t=out:st=2.84:d=0.16,
format=yuv420p
"@ -replace "`r?`n", ''

  & $ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 30 -t 3 -i $inputPath `
    -vf $filter -an -r 30 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p $segmentPath

  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed while rendering segment $($index + 1)"
  }
}

$concatPath = Join-Path $renderDir 'concat.txt'
$concatLines = for ($index = 1; $index -le $segments.Count; $index++) {
  $segmentPath = (Join-Path $renderDir ('segment-{0:D2}.mp4' -f $index)).Replace("'", "''")
  "file '$segmentPath'"
}
[System.IO.File]::WriteAllLines($concatPath, $concatLines, [System.Text.UTF8Encoding]::new($false))

$silentPath = Join-Path $renderDir 'tradehelp-promo-silent.mp4'
& $ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $concatPath -c copy $silentPath
if ($LASTEXITCODE -ne 0) {
  throw 'FFmpeg failed while joining the promo segments'
}

$beat = "aevalsrc=exprs='0.34*sin(2*PI*58*t)*exp(-24*mod(t\,0.5))*lt(mod(t\,0.5)\,0.16)+0.035*sin(2*PI*116*t)+0.018*sin(2*PI*174*t)':s=48000:d=15"
& $ffmpeg -hide_banner -loglevel error -y -i $silentPath -f lavfi -i $beat `
  -filter:a "highpass=f=32,lowpass=f=620,afade=t=in:st=0:d=0.5,afade=t=out:st=14:d=1,volume=0.48" `
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart $OutputPath

if ($LASTEXITCODE -ne 0) {
  throw 'FFmpeg failed while adding the original audio bed'
}

Write-Output $OutputPath

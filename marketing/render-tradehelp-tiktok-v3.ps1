param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'tradehelp-tiktok-promo-v3.mp4')
)

$ErrorActionPreference = 'Stop'

$ffmpeg = 'C:\Users\Rahei\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe'
$captures = Join-Path $PSScriptRoot 'captures'
$renderDir = Join-Path $env:TEMP 'tradehelp-tiktok-promo-v3-render'

if (-not (Test-Path -LiteralPath $ffmpeg)) {
  throw "FFmpeg was not found at $ffmpeg"
}

New-Item -ItemType Directory -Force -Path $renderDir | Out-Null

$segments = @(
  @{
    Duration = 2.20
    Input = 'tradehelp-production-journal.png'
    Line1 = 'YOUR TRADES'
    Line2 = 'LEAVE CLUES.'
    Sub = 'THE QUESTION IS WHETHER YOU REVIEW THEM.'
    Footer = 'JOURNAL  >  PATTERN  >  ADJUST'
    Number = '01'
    Side = 'right'
    Highlight = '18:170:455:490'
  },
  @{
    Duration = 2.70
    Input = 'tradehelp-production-journal.png'
    Line1 = 'LOG THE'
    Line2 = 'DECISION.'
    Sub = 'SETUP / EMOTION / EXECUTION'
    Footer = 'ONE CLEAN ENTRY AT A TIME'
    Number = '02'
    Side = 'left'
    Highlight = '18:170:455:490'
  },
  @{
    Duration = 2.70
    Input = 'tradehelp-production-trade-mode.png'
    Line1 = 'PREPARE BEFORE'
    Line2 = 'THE CLICK.'
    Sub = 'PLANS / RULES / DAILY LIMITS'
    Footer = 'STRUCTURE BEFORE PRESSURE'
    Number = '03'
    Side = 'right'
    Highlight = '18:145:810:370'
  },
  @{
    Duration = 2.70
    Input = 'tradehelp-production-current.png'
    Line1 = 'CATCH THE'
    Line2 = 'PATTERN.'
    Sub = 'LET THE DATA SHOW WHAT MEMORY HIDES.'
    Footer = 'YOUR PROCESS / MADE VISIBLE'
    Number = '04'
    Side = 'left'
    Highlight = '20:340:770:300'
  },
  @{
    Duration = 2.70
    Input = 'tradehelp-production-coach.png'
    Line1 = 'ASK THE HARD'
    Line2 = 'QUESTION.'
    Sub = 'AI COACH / PROCESS REVIEW / NO SIGNALS'
    Footer = 'NO HYPE. JUST A BETTER REVIEW.'
    Number = '05'
    Side = 'right'
    Highlight = '18:120:820:520'
  },
  @{
    Duration = 3.25
    Input = 'tradehelp-production-current.png'
    Line1 = 'TRADEHELP'
    Line2 = 'JOURNAL / REVIEW / IMPROVE'
    Sub = 'BUILD A CLEANER PROCESS.'
    Footer = 'DESKTOP JOURNAL FOR SERIOUS TRADERS'
    Number = '06'
    Side = 'left'
    Highlight = '20:340:770:300'
    EndCard = $true
  }
)

function Escape-DrawText([string]$Text) {
  return $Text.Replace('\', '\\').Replace(':', '\:').Replace("'", "\'").Replace('%', '\%')
}

function Invariant([double]$Value) {
  return $Value.ToString('0.00', [System.Globalization.CultureInfo]::InvariantCulture)
}

for ($index = 0; $index -lt $segments.Count; $index++) {
  $segment = $segments[$index]
  $inputPath = Join-Path $captures $segment.Input
  if (-not (Test-Path -LiteralPath $inputPath)) {
    throw "Missing production capture: $inputPath"
  }

  $duration = Invariant $segment.Duration
  $line1 = Escape-DrawText $segment.Line1
  $line2 = Escape-DrawText $segment.Line2
  $sub = Escape-DrawText $segment.Sub
  $footer = Escape-DrawText $segment.Footer
  $number = Escape-DrawText $segment.Number
  $segmentPath = Join-Path $renderDir ('segment-{0:D2}.mp4' -f ($index + 1))

  $highlightParts = $segment.Highlight.Split(':')
  $highlightX = $highlightParts[0]
  $highlightY = $highlightParts[1]
  $highlightW = $highlightParts[2]
  $highlightH = $highlightParts[3]

  if ($segment.Side -eq 'right') {
    $panelX = "if(lt(t,0.44),1180-(t/0.44)*1265,-85+11*sin((t-0.44)*1.9))"
  } else {
    $panelX = "if(lt(t,0.44),-1260+(t/0.44)*1175,-85-11*sin((t-0.44)*1.9))"
  }

  if ($segment.EndCard) {
    $line1Size = 124
    $line2Size = 38
    $line1Y = 230
    $line2Y = 385
    $subY = 470
    $panelY = "if(lt(t,0.50),1320-(t/0.50)*590,730+7*sin((t-0.50)*2.0))"
    $shade = '0x010906@0.72'
  } else {
    $line1Size = 76
    $line2Size = 88
    $line1Y = 205
    $line2Y = 292
    $subY = 410
    $panelY = "if(lt(t,0.44),1240-(t/0.44)*680,560+8*sin((t-0.44)*2.2))"
    $shade = '0x010906@0.22'
  }

  $progress = @()
  for ($bar = 0; $bar -lt 6; $bar++) {
    $barX = 70 + ($bar * 158)
    if ($bar -eq $index) {
      $barColor = '0x42f5ab@0.95'
      $barHeight = 7
    } else {
      $barColor = '0x42f5ab@0.20'
      $barHeight = 4
    }
    $progress += "drawbox=x=${barX}:y=1695:w=132:h=${barHeight}:color=${barColor}:t=fill"
  }
  $progressFilters = $progress -join ",`n"

  $filter = @"
crop=1184:704:8:57,
split=2[bg][fg];
[bg]zoompan=z='min(zoom+0.0010,1.13)':x='iw/2-(iw/zoom/2)+18*sin(on/28)':y='ih/2-(ih/zoom/2)+12*cos(on/35)':d=1:s=1080x1920:fps=30,
gblur=sigma=32,
eq=brightness=-0.50:saturation=0.72[bgv];
[fg]drawbox=x=${highlightX}:y=${highlightY}:w=${highlightW}:h=${highlightH}:color=0x42f5ab@0.78:t=5,
zoompan=z='min(zoom+0.00085,1.07)':x='iw/2-(iw/zoom/2)+8*sin(on/22)':y='ih/2-(ih/zoom/2)':d=1:s=1250x744:fps=30[fgv];
[bgv]drawbox=x=0:y=0:w=1080:h=1920:color=0x00140d@0.26:t=fill,
drawbox=x=0:y=0:w=1080:h=1920:color=${shade}:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='PROCESS  /  DISCIPLINE  /  REVIEW':fontcolor=0x42f5ab@0.08:fontsize=58:x='-320+mod(t*160,1450)':y=70,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='${number}':fontcolor=0x42f5ab@0.08:fontsize=205:x='790+18*sin(t*2.2)':y=25[base];
[base][fgv]overlay=x='${panelX}':y='${panelY}'[ui];
[ui]drawbox=x=-95:y='560+mod(t*430,744)':w=1270:h=3:color=0x42f5ab@0.42:t=fill,
drawbox=x=0:y=0:w=13:h=1920:color=0x42f5ab@0.92:t=fill,
drawbox=x='-560+t*480':y=162:w=510:h=7:color=0x42f5ab@0.95:t=fill,
drawbox=x='1080-t*370':y=535:w=420:h=3:color=0x42f5ab@0.50:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='TRADEHELP // PROCESS FIRST':fontcolor=0x42f5ab:fontsize=24:x=70:y=112,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='${line1}':fontcolor=0xf3fff9:fontsize=${line1Size}:x='if(lt(t,0.12),-1100,if(lt(t,0.42),-1100+(t-0.12)/0.30*1170,70))':y=${line1Y}:shadowcolor=black@0.70:shadowx=3:shadowy=3,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='${line2}':fontcolor=0x42f5ab:fontsize=${line2Size}:x='if(lt(t,0.20),-1200,if(lt(t,0.52),-1200+(t-0.20)/0.32*1270,70))':y=${line2Y}:shadowcolor=black@0.70:shadowx=3:shadowy=3,
drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='${sub}':fontcolor=0xccecdf:fontsize=27:x=72:y=${subY}:alpha='if(lt(t,0.48),0,min(1,(t-0.48)/0.26))',
drawbox=x=70:y=1438:w='min(940,max(0,(t-0.55)*720))':h=2:color=0x42f5ab@0.38:t=fill,
drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='${footer}':fontcolor=0xe9fff6:fontsize=30:x='70+8*sin(t*3.2)':y=1475:alpha='if(lt(t,0.62),0,min(1,(t-0.62)/0.24))',
$progressFilters,
drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='EDUCATIONAL JOURNALING TOOL / NOT FINANCIAL ADVICE / TRADING INVOLVES RISK / 18+':fontcolor=0x9ab9ac:fontsize=18:x=70:y=1780,
format=yuv420p
"@ -replace "`r?`n", ''

  & $ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 30 -t $duration -i $inputPath `
    -vf $filter -an -r 30 -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p $segmentPath

  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed while rendering animated segment $($index + 1)"
  }
}

$transitionDuration = 0.25
$xfadeFilter = @"
[0:v][1:v]xfade=transition=wipeleft:duration=0.25:offset=1.95[v1];
[v1][2:v]xfade=transition=slideup:duration=0.25:offset=4.40[v2];
[v2][3:v]xfade=transition=zoomin:duration=0.25:offset=6.85[v3];
[v3][4:v]xfade=transition=pixelize:duration=0.25:offset=9.30[v4];
[v4][5:v]xfade=transition=smoothleft:duration=0.25:offset=11.75,
fade=t=out:st=14.65:d=0.35,
format=yuv420p[outv]
"@ -replace "`r?`n", ''

$videoPath = Join-Path $renderDir 'tradehelp-promo-animated-silent.mp4'
$xfadeArgs = @('-hide_banner', '-loglevel', 'error', '-y')
for ($index = 1; $index -le $segments.Count; $index++) {
  $xfadeArgs += @('-i', (Join-Path $renderDir ('segment-{0:D2}.mp4' -f $index)))
}
$xfadeArgs += @(
  '-filter_complex', $xfadeFilter,
  '-map', '[outv]',
  '-an',
  '-r', '30',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '17',
  '-pix_fmt', 'yuv420p',
  $videoPath
)

& $ffmpeg @xfadeArgs
if ($LASTEXITCODE -ne 0) {
  throw 'FFmpeg failed while creating the kinetic transition sequence'
}

$beat = "aevalsrc=exprs='0.40*sin(2*PI*58*t)*exp(-26*mod(t\,0.5))*lt(mod(t\,0.5)\,0.17)+0.045*sin(2*PI*116*t)+0.022*sin(2*PI*174*t)+0.040*sin(2*PI*760*t)*(between(t\,1.90\,2.05)+between(t\,4.35\,4.50)+between(t\,6.80\,6.95)+between(t\,9.25\,9.40)+between(t\,11.70\,11.85))':s=48000:d=15"

& $ffmpeg -hide_banner -loglevel error -y -i $videoPath -f lavfi -i $beat `
  -filter:a "highpass=f=34,lowpass=f=1200,acompressor=threshold=0.12:ratio=3:attack=8:release=80,afade=t=in:st=0:d=0.25,afade=t=out:st=14.35:d=0.65,volume=0.58" `
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $OutputPath

if ($LASTEXITCODE -ne 0) {
  throw 'FFmpeg failed while adding the animated edit audio bed'
}

Write-Output $OutputPath

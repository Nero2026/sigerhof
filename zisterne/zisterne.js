(() => {
  const MAX_LITER = 100000

  const elStatus = document.getElementById("status")
  const mPercent = document.getElementById("mPercent")
  const mLiter = document.getElementById("mLiter")
  const mCap = document.getElementById("mCap")

  const canvas = document.getElementById("c")
  const ctx = canvas.getContext("2d")

  let percent = 50

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)) }

  function fmtLiter(n){
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'") + " L"
  }

  function setCanvasSize(){
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const cssW = Math.floor(canvas.getBoundingClientRect().width)
    const cssH = Math.floor(canvas.getBoundingClientRect().height)

    canvas.width = Math.floor(cssW * dpr)
    canvas.height = Math.floor(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function cssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  }

  function computeTankLayout(){
    const w = canvas.getBoundingClientRect().width
    const h = canvas.getBoundingClientRect().height

    const tankLeft = 18
    const tankTop = 18
    const tankBottom = h - 18

    const scaleGap = (w < 520) ? 34 : 56
    const tankRight = Math.max(tankLeft + 200, w - scaleGap - 60)

    return {
      tankLeft, tankTop,
      tankRight, tankBottom,
      tankWidth: tankRight - tankLeft,
      tankHeight: tankBottom - tankTop,
      scaleX: tankRight + ((w < 520) ? 34 : 56),
    }
  }

  function drawScale(L){
    const STROKE = cssVar("--line")
    const MUTED = cssVar("--muted")

    const x = L.scaleX
    const y0 = L.tankTop
    const y1 = L.tankBottom

    ctx.lineWidth = 2
    ctx.strokeStyle = STROKE
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y1)
    ctx.stroke()

    ctx.fillStyle = MUTED
    ctx.font = "bold 10px ui-monospace, Menlo, Consolas, monospace"
    ctx.textBaseline = "middle"

    const labelX = x + ((canvas.getBoundingClientRect().width < 520) ? 22 : 30)

    for(let p=0; p<=100; p+=10){
      const y = y1 - (y1 - y0) * (p/100)
      const w = (p % 20 === 0) ? 14 : 9

      ctx.strokeStyle = MUTED
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - w, y)
      ctx.lineTo(x, y)
      ctx.stroke()

      if(p % 20 === 0){
        ctx.fillText(`${p}%`, labelX, y)
      }
    }
  }

  function hexToRgb(h){
    h = h.replace("#","")
    return {
      r: parseInt(h.slice(0,2),16),
      g: parseInt(h.slice(2,4),16),
      b: parseInt(h.slice(4,6),16),
    }
  }

  function rgbToHex({r,g,b}){
    const f = (n)=> n.toString(16).padStart(2,"0")
    return "#" + f(r) + f(g) + f(b)
  }

  function lerp(a,b,t){ return a + (b-a)*t }

  function mix(c1,c2,t){
    const a = hexToRgb(c1), b = hexToRgb(c2)
    return rgbToHex({
      r: Math.round(lerp(a.r,b.r,t)),
      g: Math.round(lerp(a.g,b.g,t)),
      b: Math.round(lerp(a.b,b.b,t)),
    })
  }

  function drawWater(L){
    const WATER = "#38bdf8"
    const WATER_DARK = "#0ea5e9"

    const innerPad = 6

    const ix0 = L.tankLeft + innerPad
    const iy0 = L.tankTop + innerPad
    const ix1 = L.tankRight - innerPad
    const iy1 = L.tankBottom - innerPad

    const innerH = iy1 - iy0
    const waterH = innerH * (percent / 100)
    const yTop = iy1 - waterH

    if(percent <= 0) return

    const nStrips = 40
    for(let i=0;i<nStrips;i++){
      const t = i / Math.max(1, nStrips - 1)
      const col = mix(WATER_DARK, WATER, 1 - t)

      const sy0 = yTop + (waterH * i / nStrips)
      const sy1 = yTop + (waterH * (i + 1) / nStrips)

      ctx.fillStyle = col
      ctx.fillRect(ix0, sy0, ix1 - ix0, sy1 - sy0)
    }

    const glossH = 4
    ctx.fillStyle = mix(WATER, "#ffffff", 0.35)
    ctx.fillRect(ix0, yTop, ix1 - ix0, Math.min(iy1, yTop + glossH) - yTop)
  }

  function drawTank(){
    const bg = "rgba(0,0,0,0.08)"
    const stroke = cssVar("--line")

    const w = canvas.getBoundingClientRect().width
    const h = canvas.getBoundingClientRect().height

    ctx.clearRect(0,0,w,h)
    ctx.fillStyle = bg
    ctx.fillRect(0,0,w,h)

    const L = computeTankLayout()

    ctx.fillStyle = "rgba(0,0,0,0.12)"
    ctx.strokeStyle = stroke
    ctx.lineWidth = 3
    ctx.fillRect(L.tankLeft, L.tankTop, L.tankWidth, L.tankHeight)
    ctx.strokeRect(L.tankLeft, L.tankTop, L.tankWidth, L.tankHeight)

    drawScale(L)
    drawWater(L)
  }

  function updateUI(){
    const liter = Math.round((percent / 100) * MAX_LITER)

    mPercent.textContent = `${percent} %`
    mLiter.textContent = fmtLiter(liter)
    mCap.textContent = fmtLiter(MAX_LITER)

    elStatus.classList.remove("statusOk","statusWarn","statusAlarm")

    if(percent <= 10){
      elStatus.textContent = "STATUS: ALARM"
      elStatus.classList.add("statusAlarm")
    } else if(percent <= 25){
      elStatus.textContent = "STATUS: WARNUNG"
      elStatus.classList.add("statusWarn")
    } else {
      elStatus.textContent = "STATUS: OK"
      elStatus.classList.add("statusOk")
    }

    drawTank()
  }

  function setPercent(v){
    percent = clamp(parseInt(v,10), 0, 100)
    updateUI()
  }

  function change(delta){
    percent = clamp(percent + parseInt(delta,10), 0, 100)
    updateUI()
  }

  document.getElementById("plus").addEventListener("click", () => change(+1))
  document.getElementById("minus").addEventListener("click", () => change(-1))
  document.getElementById("p0").addEventListener("click", () => setPercent(0))
  document.getElementById("p50").addEventListener("click", () => setPercent(50))
  document.getElementById("p100").addEventListener("click", () => setPercent(100))

  window.addEventListener("keydown", (e) => {
    if(e.key === "ArrowUp") change(+1)
    if(e.key === "ArrowDown") change(-1)
    if(e.key === "Home") setPercent(0)
    if(e.key === "End") setPercent(100)
  })

  for(const id of ["plus","minus","p0","p50","p100"]){
    const b = document.getElementById(id)
    b.style.touchAction = "manipulation"
  }

  function redraw(){
    setCanvasSize()
    drawTank()
  }

  window.addEventListener("resize", redraw)
  window.addEventListener("orientationchange", redraw)

  setCanvasSize()
  updateUI()
})()

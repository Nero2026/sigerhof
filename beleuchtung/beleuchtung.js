const WORKER_URL = "https://test.remo-bossart.workers.dev"
const WEB_TOKEN = "x_!1848!_x"

const btn = document.getElementById("testLightBtn")
const statusText = document.getElementById("statusText")

let isOn = false

function updateUI() {
  if (isOn) {
    btn.classList.remove("switchOff")
    btn.classList.add("switchOn")
    btn.textContent = "Licht EIN"
    statusText.textContent = "Status: EIN"
  } else {
    btn.classList.remove("switchOn")
    btn.classList.add("switchOff")
    btn.textContent = "Licht AUS"
    statusText.textContent = "Status: AUS"
  }
}

async function getStatus() {
  const res = await fetch(WORKER_URL + "/status", {
    method: "GET",
    headers: {
      "x-token": WEB_TOKEN
    }
  })

  const data = await res.json()

  isOn = data.on
  updateUI()
}

async function switchLight(turnOn) {

  const route = turnOn ? "/on" : "/off"

  const res = await fetch(WORKER_URL + route, {
    method: "GET",
    headers: {
      "x-token": WEB_TOKEN
    }
  })

  if (!res.ok) {
    throw new Error("Schalten fehlgeschlagen")
  }

  isOn = turnOn
  updateUI()
}

btn.addEventListener("click", async () => {
  btn.disabled = true

  try {
    await switchLight(!isOn)
  } catch {
    alert("Fehler beim Schalten")
  }

  btn.disabled = false
})

getStatus()

setInterval(getStatus, 5000)
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
}

btn.addEventListener("click", async () => {
  btn.disabled = true

  try {
    await switchLight(!isOn)
    isOn = !isOn
    updateUI()
  } catch (e) {
    alert("Fehler beim Schalten")
  } finally {
    btn.disabled = false
  }
})

updateUI()
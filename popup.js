const settings = {deadnames: [], chosenname: {first: "", last:"", middle: ""}}
const savedSettings = {}
const deadnamesDiv = document.getElementById("deadnames")
const chosennameDiv = document.getElementById("chosenname")

async function loadSettings() {
    for (const setting of Object.keys(settings)){
        const value = (await chrome.storage.local.get(setting))[setting]
        if (value !== undefined) {
            settings[setting] = value
            savedSettings[setting] = copy(value)
        }
    }
}
function saveSettings() {
    for (const setting of Object.keys(settings)){
        if (settings[setting] !== savedSettings[setting]){
            savedSettings[setting] = copy(settings[setting])
            chrome.storage.local.set({[setting]: settings[setting]})
        }
    }
}

function copy(json) {
    return JSON.parse(JSON.stringify(json))
}

function createNewDead(index = 0) {
    const temp = document.createElement("div")
    temp.innerHTML += `<div>
            <div>
                <label for="first">First Name: </label>
                <input name="first" type="text">
            </div>
            <div>
                <label for="middle">Middle Name(s): </label>
                <input name="middle" type="text">
            </div>
            <div>
                <label for="last">Last Name: </label>
                <input name="last" type="text">
            </div>
        </div>`
    deadnamesDiv.appendChild(temp.firstChild)
    temp.remove()
    if (settings.deadnames.length > index) {
        if (settings.deadnames[index].first) {
            deadnamesDiv.lastChild.querySelectorAll("input").forEach(element => {
                element.value = settings.deadnames[index][element.name]
            })
        }
    } else {
        settings.deadnames.push({first: "", last:"", middle: ""})
    }
    listenToNewDead(deadnamesDiv.lastChild, index)
}

function listenToNewDead(element, index) {
    let created = false;
    if (settings.deadnames.length > index + 1 && settings.deadnames[index].first) {
        createNewDead(index + 1)
        created = true
    }
    for (const inp of element.getElementsByTagName("input")) {
        inp.addEventListener("input", event => {
            if (!created) {
                createNewDead(index + 1)
                created = true
            }
            settings.deadnames[index][event.target.name] = event.target.value
        })
    }
}

function main() {
    document.getElementById("save").addEventListener("click", saveSettings)
    loadSettings().then(() => {
        createNewDead()
        chosennameDiv.querySelectorAll("input").forEach(element => {
            element.value = settings.chosenname[element.name]
            element.addEventListener("input", event => {
                settings.chosenname[event.target.name] = event.target.value
            })
        })
    })
}
main()
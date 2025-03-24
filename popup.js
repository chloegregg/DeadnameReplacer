
const storage = {
    deadnames: [], 
    chosenname: {first: "", last:"", middle: "", honorific: ""},
    substitutions: [],
    count: 0,
    changeInputs: false,
    constantUpdates: false,
    useHighlight: false,
    validURLs: "^.*://.*$",
    invalidURLs: "",
    highlightPattern: '',
    stylesheet: ``
}
let currentSavedStorage = {}
const storageEvent = {
    update(property) {
        if (this._listeners[property] === undefined) {
            return
        }
        for (const callback of this._listeners[property]) {
            callback()
        }
    },
    addListener(property, callback) {
        if (property instanceof Array) {
            property.forEach(p => {
                this.addListener(p, callback)
            })
            return
        }
        if (this._listeners[property] === undefined) {
            this._listeners[property] = []
        }
        this._listeners[property].push(callback)
    },
    _listeners: {},
    loaded: false
}
const deadnamesDiv = document.getElementById("deadnames")
const chosennameDiv = document.getElementById("chosenname")
const settingsDiv = document.getElementById("settings")


function loadStorage() {
    return chrome.storage.local.get().then(value => {
        Object.assign(storage, value ?? {})
        for (const key of Object.keys(storage)) {
            storageEvent.update(key)
        }
        storageEvent.loaded = true
    })
}
function saveStorage() {
    if (storageEvent.loaded) {
        const updated = {}
        for (const key of Object.keys(storage)) {
            if (storage[key] !== currentSavedStorage[key]) {
                updated[key] = currentSavedStorage[key] = storage[key]
            }
        }
        chrome.storage.local.set(updated)
    }
}
function createNewDead(index = 0) {
    const temp = document.createElement("div")
    temp.innerHTML += `<div class="deadname">
            <div>
                <h3>Dead #${index+1} <span class="remove">(clear)</span></h3>
                
            </div>
            <div class="inputdiv">
                <label for="first">First Name: </label>
                <input name="first" type="text">
            </div>
            <div class="inputdiv">
                <label for="middle">Middle Name(s): </label>
                <input name="middle" type="text">
            </div>
            <div class="inputdiv">
                <label for="last">Last Name: </label>
                <input name="last" type="text">
            </div>
            <div class="inputdiv">
                <label for="honorific">Honorific: </label>
                <input name="honorific" type="text">
            </div>
        </div>`
    const div = temp.firstChild
    temp.remove()
    div.querySelector(".remove").onclick = () => div.querySelectorAll("input").forEach(i => {
        storage.deadnames[index][i.name] = i.value = ""
    })
    deadnamesDiv.appendChild(div)
    if (storage.deadnames.length <= index) {
        storage.deadnames.push({first: "", last: "", middle: "", honorific: ""})
    }
    listenToNewDead(div, index)
}

function listenToNewDead(element, index) {
    let created = false;
    if (storage.deadnames.length > index && storage.deadnames[index].first) {
        createNewDead(index + 1)
        created = true
    }
    connectInputsTo(element, storage.deadnames[index], event => {
        if (!created) {
            createNewDead(index + 1)
            created = true
        }
    })
}

function loadNames() {
    for (const dn of document.getElementsByClassName("deadname")) {
        dn.remove()
    }
    createNewDead()
    connectInputsTo(chosennameDiv, storage.chosenname)
}
function loadSettings() {
    connectInputsTo(settingsDiv, storage)
    const highlightToggle = document.getElementById("highlighttoggle")
    const highlightTemplate = document.getElementById("highlighthidden")
    function updateHighlightState() {
        highlightTemplate.style.display = highlightToggle.checked ? "block" : "none"
    }
    highlightToggle.addEventListener("input", updateHighlightState)
    updateHighlightState()
}
function connectInputsTo(div, object, callback) {
    div.querySelectorAll("input").forEach(element => {
        const dataKey = element.type == "checkbox" ? "checked" : "value"
        element[dataKey] = object[element.name]
        element.addEventListener("input", event => {
            object[element.name] = element[dataKey]
            if (callback) {
                callback(event)
            }
        })
    })
}

function main() {
    document.getElementById("save").addEventListener("click", saveStorage)
    loadStorage().then(() => {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
                storage[key] = newValue
                storageEvent.update(key)
            }
        })
    }).then(loadNames).then(loadSettings)
}
main()
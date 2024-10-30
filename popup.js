
const storage = {
    deadnames: [], 
    chosenname: {first: "", last:"", middle: ""},
    substitutions: [],
    count: 0,
}
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
        chrome.storage.local.set(storage)
    }
}
function createNewDead(index = 0) {
    const temp = document.createElement("div")
    temp.innerHTML += `<div class="deadname">
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
    if (storage.deadnames.length > index) {
        if (storage.deadnames[index].first) {
            deadnamesDiv.lastChild.querySelectorAll("input").forEach(element => {
                element.value = storage.deadnames[index][element.name]
            })
        }
    } else {
        storage.deadnames.push({first: "", last:"", middle: ""})
    }
    listenToNewDead(deadnamesDiv.lastChild, index)
}

function listenToNewDead(element, index) {
    let created = false;
    if (storage.deadnames.length > index && storage.deadnames[index].first) {
        createNewDead(index + 1)
        created = true
    }
    for (const inp of element.getElementsByTagName("input")) {
        inp.addEventListener("input", event => {
            if (!created) {
                createNewDead(index + 1)
                created = true
            }
            storage.deadnames[index][event.target.name] = event.target.value
        })
    }
}

function loadNames() {
    for (const dn of document.getElementsByClassName("deadname")) {
        dn.remove()
    }
    createNewDead()
    chosennameDiv.querySelectorAll("input").forEach(element => {
        element.value = storage.chosenname[element.name]
        element.addEventListener("input", event => {
            storage.chosenname[event.target.name] = event.target.value
        })
    })
}

function main() {
    document.getElementById("save").addEventListener("click", saveStorage)
    loadStorage().then(() => {
        loadNames()
    })
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
            storage[key] = newValue
        }
    })
}
main()
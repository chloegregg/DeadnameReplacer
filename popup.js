const settings = {
    deadnames: [], 
    chosenname: {first: "", last:"", middle: ""},
    substitutions: [],
}
const savedSettings = {}
const deadnamesDiv = document.getElementById("deadnames")
const chosennameDiv = document.getElementById("chosenname")

const WORD_CHARS = "a-zA-Z"
const WORD_REGEX = new RegExp(`[${WORD_CHARS}]+`, "g")

// generate substitutions from all `bad` into `good`
function generateSubstitutions(bad, good) {
    settings.substitutions = []
    for (let i = 0; i < bad.length; i++) {
        const replName = {first: good.first, middle: good.middle, last: good.last}
        if (!replName.first) {
            replName.first = bad[i].first
        }
        if (!replName.middle) {
            replName.middle = bad[i].middle
        }
        if (!replName.last) {
            replName.last = bad[i].last
        }
        if (bad[i].last.match(WORD_REGEX) && replName.last.match(WORD_REGEX)) {
            if (bad[i].middle.match(WORD_REGEX) && replName.middle.match(WORD_REGEX)) {
                addSubstitution([bad[i].first, bad[i].middle, bad[i].last].join(" "), [replName.first, replName.middle, replName.last].join(" "))
                addSubstitution([bad[i].first, bad[i].middle, bad[i].last].join(""), [replName.first, replName.middle, replName.last].join(""))
            }
            addSubstitution([bad[i].first, bad[i].last].join(" "), [replName.first, replName.last].join(" "))
            addSubstitution([bad[i].first, bad[i].last].join(""), [replName.first, replName.last].join(""))
            addSubstitution(bad[i].last, replName.last)
        }
        addSubstitution(bad[i].first, replName.first)
    }
}
// add a substitution
function addSubstitution(bad, good) {
    if (!bad.match(WORD_REGEX) || !good.match(WORD_REGEX)) {
        return
    }
    function titleCase(str) {
        let title = ""
        let lastWord = -1
        for (const word of str.matchAll(WORD_REGEX)) {
            title += str.slice(lastWord+1, word.index).toLowerCase()
            title += str[word.index].toUpperCase()
            lastWord = word.index
        }
        title += str.slice(lastWord+1).toLowerCase()
        return title
    }
    function createReplFor(bad, good, flags = "g") {
        let replacement = "$1"
        const words = good.split(" ")
        const badWordCount = bad.split(" ").length
        for (let i = 0; i < words.length; i++) {
            replacement += words[i]
            if (i + 1 == words.length) {
                replacement += "$" + (badWordCount+1)
            } else if (i + 1 >= badWordCount) {
                replacement += " "
            } else {
                replacement += "$" + (i+2)
            }
        }
        for (let i = words.length; i < badWordCount.length; i++) {
            replacement += "$" + (i+2)
        }
        return [[`([^${WORD_CHARS}]|^)${bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, `([^${WORD_CHARS}]+)`)}([^${WORD_CHARS}]|$)`, flags], replacement]
    }
    // lower case
    settings.substitutions.push(createReplFor(bad.toLowerCase(), good.toLowerCase()))
    // UPPER CASE
    settings.substitutions.push(createReplFor(bad.toUpperCase(), good.toUpperCase()))
    if (bad.length > 0 && good.length > 0) {
        // Title Case
        settings.substitutions.push(createReplFor(titleCase(bad), titleCase(good)))
        // Single title case
        settings.substitutions.push(createReplFor(bad[0].toUpperCase()+bad.slice(1).toLowerCase(), good[0].toUpperCase()+good.slice(1).toLowerCase()))
        
    }
    // aNy oThEr cAsE
    settings.substitutions.push(createReplFor(bad, good, "gi"))
}
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
            generateSubstitutions(settings.deadnames, settings.chosenname)
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
                generateSubstitutions(settings.deadnames, settings.chosenname)
            })
        })
        generateSubstitutions(settings.deadnames, settings.chosenname)
    })
}
main()
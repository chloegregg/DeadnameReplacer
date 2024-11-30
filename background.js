
const storage = {
    deadnames: [], 
    chosenname: {first: "", last:"", middle: "", honorific: ""},
    substitutions: [],
    count: 0,
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

// https://regex101.com/r/kGIVxi/1
const WORD_CHARS = "a-zA-Z\u00C0-\u024F\u1E00-\u1EFF"
const WORD_REGEX = new RegExp(`[${WORD_CHARS}]+`, "g")
const MULTI_WORD_REGEX = new RegExp(`[${WORD_CHARS}]+(\/[${WORD_CHARS}]+)*`, "g")

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
// generate substitutions from all `bad` into `good`
function generateSubstitutions(bad, good) {
    storage.substitutions = []
    for (let i = 0; i < bad.length; i++) {
        const replName = {}
        for (const key of ["first", "middle", "last", "honorific"]) {
            if (replName[key] == "-") {
                replName[key] = bad[i][key]
            } else {
                replName[key] = good[key]
            }
        }
        function addCombination(names) {
            const badName = names.map(key => bad[i][key])
            const goodName = names.map(key => replName[key])
            let nameCombos = [Array(names.length)]
            for (let i = 0; i < names.length; i++) {
                if (!badName[i].match(MULTI_WORD_REGEX)) {
                    return
                }
                const badNames = badName[i].split("/")
                const goodNames = goodName[i].split("/")
                let newNameCombos = []
                for (let j = 0; j < badNames.length; j++) {
                    const combos = nameCombos.map(c => [...c])
                    for (let k = 0; k < combos.length; k++) {
                        combos[k][i] = [badNames[j], goodNames[badNames.length == goodNames.length ? j : 0]]
                    }
                    newNameCombos = newNameCombos.concat(combos)
                }
                nameCombos = newNameCombos
            }
            for (let i = 0; i < nameCombos.length; i++) {
                const [bad, good] = [[], []]
                for (let j = 0; j < nameCombos[i].length; j++) {
                    bad.push(nameCombos[i][j][0])
                    good.push(nameCombos[i][j][1])
                }
                storage.substitutions.push(getSubstitution(bad.join(" "), good.join(" ")))
                if (bad.length > 1) {
                    storage.substitutions.push(getSubstitution(bad.join(""), good.join("")))
                }
            }
        }
        addCombination(["honorific", "first", "middle", "last"])
        addCombination(["honorific", "first", "last"])
        addCombination(["honorific", "first"])
        addCombination(["honorific", "last"])
        addCombination(["first", "middle", "last"])
        addCombination(["first", "last"])
        addCombination(["last", "first"])
        addCombination(["first"])
        addCombination(["last"])
    }
    saveStorage()
}
// get a substitution
function getSubstitution(bad, good) {
    bad = bad.toLowerCase().trim()
    good = good.toLowerCase().trim()
    if (bad == good) {
        return
    }
    if (!bad.match(WORD_REGEX)) {
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
    const createdSubs = []
    if (good.length > 0) {
        // lower case
        createdSubs.push(createReplFor(bad.toLowerCase(), good.toLowerCase()))
        // UPPER CASE
        createdSubs.push(createReplFor(bad.toUpperCase(), good.toUpperCase()))
        if (bad.length > 0) {
            // Title Case
            createdSubs.push(createReplFor(titleCase(bad), titleCase(good)))
            // Single title case
            createdSubs.push(createReplFor(bad[0].toUpperCase()+bad.slice(1).toLowerCase(), good[0].toUpperCase()+good.slice(1).toLowerCase()))
        }
    }
    // aNy oThEr cAsE (gets replaced with Title Case)
    createdSubs.push(createReplFor(bad, titleCase(good), "gi"))
    return createdSubs
}
function parseAndAddDeadname(text) {
    const names = text.matchAll(WORD_REGEX).map(match => match[0]).toArray()
    if (names.length == 1) {
        storage.deadnames.push({first: names[0], middle: "", last: ""})
    } else {
        storage.deadnames.push({first: names[0], middle: names.slice(1, -1).join(" "), last: names[names.length-1]})
    }
    saveStorage()
}

function main() {
    chrome.runtime.onInstalled.addListener(info => {
        if (info.reason === chrome.runtime.OnInstalledReason.INSTALL) {
            chrome.tabs.create({url: chrome.runtime.getURL("setup.html")})
        }
        chrome.contextMenus.create({
            title: "Register Deadname",
            contexts: ["selection"],
            id: "deadname-remover"
        })
    })
    loadStorage().then(() => {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
                storage[key] = newValue
                storageEvent.update(key)
            }
        })
    })
    storageEvent.addListener(["deadnames", "chosenname"], () => {
        generateSubstitutions(storage.deadnames, storage.chosenname)
    })
    // remove empty deadnames
    storageEvent.addListener("deadnames", () => {
        let changed = false
        for (let i = 0; i < storage.deadnames.length; i++) {
            if (!storage.deadnames[i].first.match(WORD_REGEX)) {
                storage.deadnames.splice(i, 1)
                i--
                changed = true
            }
        }
        if (changed) {
            storageEvent.update("deadnames")
            saveStorage()
        }
    })
    chrome.contextMenus.onClicked.addListener(info => {
        if (info.menuItemId == "deadname-remover") {
            parseAndAddDeadname(info.selectionText)
        }
    })
}
main()
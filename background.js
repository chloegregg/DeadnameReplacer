
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

// https://regex101.com/r/kGIVxi/1
const WORD_CHARS = "a-zA-Z\u00C0-\u024F\u1E00-\u1EFF"
const WORD_REGEX = new RegExp(`[${WORD_CHARS}]+`, "g")

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
// generate substitutions from all `bad` into `good`
function generateSubstitutions(bad, good) {
    storage.substitutions = []
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
    saveStorage()
}
// add a substitution
function addSubstitution(bad, good) {
    bad = bad.toLowerCase().trim()
    good = good.toLowerCase().trim()
    if (bad == good) {
        return
    }
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
    storage.substitutions.push(createReplFor(bad.toLowerCase(), good.toLowerCase()))
    // UPPER CASE
    storage.substitutions.push(createReplFor(bad.toUpperCase(), good.toUpperCase()))
    if (bad.length > 0 && good.length > 0) {
        // Title Case
        storage.substitutions.push(createReplFor(titleCase(bad), titleCase(good)))
        // Single title case
        storage.substitutions.push(createReplFor(bad[0].toUpperCase()+bad.slice(1).toLowerCase(), good[0].toUpperCase()+good.slice(1).toLowerCase()))
    }
    // aNy oThEr cAsE (gets replaced with Title Case now)
    storage.substitutions.push(createReplFor(bad, titleCase(good), "gi"))
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
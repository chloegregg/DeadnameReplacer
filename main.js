
const storage = {
    deadnames: [], 
    chosenname: {first: "", last:"", middle: "", honorific: ""},
    substitutions: [],
    count: 0,
    changeInputs: false,
    constantUpdates: false,
    useHighlight: false,
    validURLRegex: "",
    validURLList: "",
    useBlacklist: false,
    useRegex: false,
    enabled: true,
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
    addListener(property, callback, runNow = false) {
        if (runNow) {
            callback()
        }
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
let runOnce = false
let currentlyEnabled = false
let allChanges = []

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
// html tags to avoid changing
const TAG_BLACKLIST = ["script", "style", "link"]
// regex for attributes to avoid changing
const ATTRIBUTE_BLACKLIST = [/on\w+/, /style/, /class/, /href/, /src/, /id/]
// html tags with the `value` property to change
const INPUT_WHITELIST = ["input", "textarea"]
// substitutions after creating actual RegExp objects
let regexedSubs = []
// keeps track of the counter, before the link to storage is made, so we don't lose any
let localCount = 0

function updateCount() {
    if (!storageEvent.loaded) {
        return
    }
    if (localCount > 0) {
        storage.count += localCount
        localCount = 0
    }
}

// replace text
function fixText(text, substitutions) {
    for (let i = 0; i < substitutions.length; i++) {
        const matches = text.matchAll(substitutions[i][0]).toArray()
        if (matches.length > 0) {
            text = text.replace(substitutions[i][0], substitutions[i][1])
        }
        localCount += matches.length
    }
    updateCount()
    return text
}
function fixTextUsingElements(text, pattern="${name}", substitutions) {
    const nodes = [text]
    for (let i = 0; i < substitutions.length; i++) {
        let nodeIndex = 0 // nodeIndex is always even to capture text nodes
        while (nodeIndex < nodes.length) {
            const node = nodes[nodeIndex]
            const matches = node.matchAll(substitutions[i][0]).toArray()
            const inserted = []
            let lastIndex = 0
            for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
                const match = matches[matchIndex]
                const fixed = match[0].replace(substitutions[i][0], substitutions[i][1])
                const innerFixed = fixed.slice(match[1].length, fixed.length - match[match.length-1].length)
                const container = document.createElement("span")
                container.innerHTML = pattern.replace(/\$\{name\}/gi, innerFixed)
                container.className = "dnr-fixed-text"
                inserted.push(node.slice(lastIndex, match.index + match[1].length))
                inserted.push(container)
                lastIndex = match.index + match[0].length - match[match.length-1].length
            }
            inserted.push(node.slice(lastIndex))
            nodes.splice(nodeIndex, 1, ...inserted)
            localCount += matches.length
            nodeIndex += 1 + inserted.length
        }
    }
    updateCount()
    return nodes
}

function fixElement(element, substitutions = regexedSubs) {
    console.log("fixElement", element)
    if (element === null || (element.tagName && TAG_BLACKLIST.includes(element.tagName.toLowerCase()))) {
        return false
    }
    let html = element.innerHTML
    if (!html) {
        html = ""
    }
    let changed = false
    let containsInput = false
    if (storage.changeInputs) {
        for (const tag of INPUT_WHITELIST) {
            if (html.includes("<" + tag)) {
                containsInput = true
                break
            }
        }
        // change input values
        if (element.tagName && INPUT_WHITELIST.includes(element.tagName.toLowerCase())) {
            const fixed = fixText(element.value, substitutions.flat())
            if (fixed !== element.value) {
                changed = true
                element.value = fixed
            }
        }
    }
    const childSubs = [...substitutions]
    if (!containsInput) {
        for (let i = 0; i < childSubs.length; i++) {
            if (html.match(childSubs[i][childSubs[i].length-1][0]) === null) {
                childSubs.splice(i, 1)
                i--
            }
        }
    }

    // change attributes
    console.log("Element", element)
    if (element.attributes !== undefined) {
        console.log("Attributes", element.attributes)
        attrs: for (const at of Object.keys(element.attributes)) {
            if (element.attributes[at] === undefined) {
                continue attrs
            }
            console.log("Checking attribute", at)
            for (const attrRegex of ATTRIBUTE_BLACKLIST) {
                if (at.match(attrRegex) !== null) {
                    continue attrs
                }
            }
            const fixed = fixText(element.attributes[at].value, substitutions.flat())
            console.log("Fixed", fixed)
            if (fixed !== element.attributes[at].value) {
                changed = true
                element.attributes[at].value = fixed
            }
        }
    }

    if (childSubs.length == 0) {
        return false
    }

    // do children
    let child = element.firstChild
    while (child) {
        const {
            changed: childChanged,
            next: nextnode
        } = fixNode(child, childSubs)
        changed ||= childChanged
        child = nextnode
    }
    return changed
}
function fixNode(node, substitutions = regexedSubs) {
    console.log("Node", node)
    if (node.nodeType == Node.TEXT_NODE) {
        if (storage.useHighlight) {
            const fixed = fixTextUsingElements(node.data, storage.highlightPattern, substitutions.flat())
            if (fixed[0] !== node.data) {
                node.after(...fixed)
                allChanges.push({
                    type: "insert",
                    node: node.nextSibling,
                    data: {original: node.data, fixed}
                })
                node.remove()
                return {
                    changed: true,
                    next: fixed[fixed.length-2]?.nextSibling?.nextSibling
                }
            }
            return {
                changed: false,
                next: node.nextSibling
            }
        } else {
            const fixed = fixText(node.data, substitutions.flat())
            if (fixed !== node.data) {
                allChanges.push({
                    type: "text",
                    node,
                    data: {original: node.data, fixed}
                })
                node.data = fixed
                return {
                    changed: true,
                    next: node.nextSibling
                }
            }
            return {
                changed: false,
                next: node.nextSibling
            }
        }
    }
    return {
        changed: fixElement(node, substitutions),
        next: node.nextSibling
    }
}
function fixTitle() {
    const title = document.querySelector("title")
    if (title) {
        const fixed = fixText(title.text, regexedSubs.flat())
        if (fixed != title.text) {
            title.text = fixed
            return true
        }
    }
    return false
}
function fixDocument() {
    let changed = fixElement(document.body)
    changed ||= fixTitle()
    console.log("Changed:", changed)
    saveStorage()
    return changed
}
function revertChanges() {
    for (const change of allChanges) {
        if (change.type == "text") {
            if (change.node.data == change.data.fixed) {
                change.node.data = change.data.original
            }
        } else if (change.type == "insert") {
            const nodes = []
            let node = change.node
            let stillExists = true
            for (let i = 0; i < change.data.fixed.length; i++) {
                if (node === null) {
                    stillExists = false
                    break
                }
                if (node.nodeType == Node.TEXT_NODE) {
                    if (node.data != change.data.fixed[i]) {
                        stillExists = false
                        break
                    }
                }
                if (node.nodeType == Node.ELEMENT_NODE) {
                    if (node != change.data.fixed[i]) {
                        stillExists = false
                        break
                    }
                }
                nodes.push(node)
                node = node.nextSibling
            }
            if (stillExists) {
                change.node.before(change.data.original)
                for (const node of nodes) {
                    node.remove()
                }
            }
        }
    }
    allChanges = []
}

// observe changes in tree
const bodyObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === "characterData") {
            fixNode(mutation.target)
        } else if (mutation.type === "attributes") {
            fixElement(mutation.target.parentElement)
        } else if (mutation.type === "childList") {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
                fixNode(mutation.addedNodes[i])
            }
        }
    })
    if (mutations.length > 0) {
        saveStorage()
    }
})
// observe title
const titleObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        fixTitle()
        saveStorage()
    })
})
function startObserving() {
    bodyObserver.observe(document.body, {
        childList: true,
        attributes: true,
        subtree: true,
        characterData: true
    })
    if (title = document.querySelector("title")) {
        titleObserver.observe(title, {
            childList: true
        })
    }
}
function stopObserving() {
    bodyObserver.disconnect()
    titleObserver.disconnect()
}

let constantUpdateInterval
function enable() {
    if (document.body === null) {
        // iframe from another origin or something
        return
    }
    currentlyEnabled = true
    if (!runOnce) {
        runOnce = true
        main()
    }
    fixDocument()
    startObserving()
}
function disable() {
    currentlyEnabled = false
    stopObserving()
    revertChanges()
}
function checkForEnable() {
    if (!storage.enabled) {
        return false
    }
    if (storage.useRegex) {
        // if regex exists and matches the host
        if (storage.validURLRegex && !(storage.useBlacklist ^ new RegExp("^" + storage.validURLRegex + "$").test(document.location.host))) {
            return false
        }
    } else {
        // if list exists and the host is in the list (or ends with something in the list)
        if (storage.validURLList && !(storage.useBlacklist ^ storage.validURLList.split(",").some(url => document.location.host.endsWith(url.trim())))) {
            return false
        }
    }
    return true
}

// init code
function main () {
    storageEvent.addListener("substitutions", () => {
        regexedSubs = []
        for (let i = 0; i < storage.substitutions.length; i++) {
            const patternSubs = []
            for (let j = 0; j < storage.substitutions[i].length; j++) {
                patternSubs.push([new RegExp(...storage.substitutions[i][j][0]), storage.substitutions[i][j][1]])
            }
            regexedSubs.push(patternSubs)
        }
        fixDocument()
    }, true)
    storageEvent.addListener("count", updateCount, true)
    
    const stylesheet = document.createElement("style")
    document.head.appendChild(stylesheet)
    storageEvent.addListener("stylesheet", () => {
        stylesheet.textContent = storage.stylesheet
    }, true)
    storageEvent.addListener("constantUpdates", () => {
        if (storage.constantUpdates) {
            constantUpdateInterval = setInterval(fixDocument, 1000)
        } else if (constantUpdateInterval) {
            clearInterval(constantUpdateInterval)
        }
    }, true)
}
loadStorage().then(() => {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
            storage[key] = newValue
            storageEvent.update(key)
        }
    })
    storageEvent.addListener(["enabled", "validURLRegex", "validURLList", "useBlacklist", "useRegex"], () => {
        let shouldEnable = checkForEnable()
        if (shouldEnable && !currentlyEnabled) {
            enable()
        } else if (!shouldEnable && currentlyEnabled) {
            disable()
        }
    }, true)
})
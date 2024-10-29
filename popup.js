const settings_ids = [
    "from",
    "to"
]

var settings = {}

function onInit(){

    document.getElementById("save").onclick = saveSettings
    for (const setting of settings_ids){
        chrome.storage.local.get(setting, (result) => {
            document.getElementById(setting).value = result[setting]
            settings[setting] = result[setting]
        })
    }
}

function saveSettings(){
    console.log("AAAAAA")
    for (const setting of settings_ids){
        const setting_value = document.getElementById(setting).value
        if (setting_value != settings[setting]){
            console.log("passed condition")
            settings[setting] = setting_value
            var setting_dict = {}
            setting_dict[setting]=setting_value
            chrome.storage.local.set(setting_dict)
        }
    }
}

document.addEventListener('DOMContentLoaded', onInit, false);
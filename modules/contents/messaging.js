class Messaging{
    constructor(message){
        this.sendMessage(message);
    }
    sendMessage(message){
        const self = this
        chrome.runtime.sendMessage(message);
    }
}
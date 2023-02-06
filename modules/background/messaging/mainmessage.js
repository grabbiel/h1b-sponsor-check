export default class Message{
    constructor(tabId, origin, operation, data){
        chrome.tabs.sendMessage(tabId, {
            origin: origin,
            operation: operation,
            data: data
        });
    }
}
class Messaging{
    constructor(message){
        this.response = null;
        this.sendMessage(message);
    }
    sendMessage(message){
        const self = this
        try{
            chrome.runtime.sendMessage(message, function(response){
                if(chrome.runtime.lastError || response===undefined){
                    return;
                }else{
                    self.response = response;
                }
            });
        }catch{
            return;
        }
    }
}
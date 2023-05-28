class LoadPage{
    constructor(popupContainer){
        this.body = null;
        this.css = this.createStyleSheet();
        this.#injectCSS();
        this.#injectHTML(popupContainer);
    }
    createStyleSheet(){
        var loadingStyleSheet = document.createElement("link");
        loadingStyleSheet.rel = "stylesheet";
        return loadingStyleSheet;
    }
    #injectCSS(){
        var a = chrome.runtime.getURL("modules/popup/html/loading.css");
        this.css.href = a;
        document.head.appendChild(this.css);
    }
    async #injectHTML(popupContainer){
        await fetch(chrome.runtime.getURL("modules/popup/html/loading.html")).then(
            (readHTML)=> readHTML.text()
        ).then((txt)=>{
            popupContainer.firstElementChild.insertAdjacentHTML('afterend',txt);
            this.body = document.getElementById("lds-ring");
        });
    }
    remove(){
        this.css.remove();
        this.body.remove();
    }
}
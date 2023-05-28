class PostingBadge{
    constructor(positionContainer, jobClassification){
        this.container = positionContainer;
        this.clearCache();
        this.#addBadge(jobClassification);
    }
    clearCache(){
        if(this.container.querySelector("span") != undefined){
            Array.from(this.container.querySelectorAll("span")).forEach(
                (spanelement)=>{ this.container.removeChild(spanelement); }
            );
        }
    }
    #addBadge(cstatus){
        const spanSpace = document.createElement("span");
        spanSpace.innerHTML = " ";
        this.container.appendChild(spanSpace);
        this.container.appendChild(this.#createBadge(cstatus));
    }
    #createBadge(companystatus){
        this.cstatus = companystatus;
        const spanElement = document.createElement("span");
        spanElement.style =`
        vertical-align: middle;
        display: inline-block;
        font-size: 40%;
        background-color: #FF2D00;
        line-height: 50%;
        color: white; 
        padding: 1.25% 1.25%; 
        text-align: center; 
        border-radius: 7.5%;
        `;
        if(this.cstatus == 1){spanElement.style.backgroundColor = "#0FFF00";}
        const anchor = document.createElement("a");
        anchor.innerText = "sponsors";
        anchor.title = "More H1B information";
        anchor.addEventListener("click",e=>{
            e.preventDefault();
            window.scrollTo(0,0);
            this.#popup_manager();
            return false;
        });
        spanElement.appendChild(anchor);
        return spanElement;
    }
    #popup_manager(){
        new Messaging({origin: "popup", operation: "request", data:{full: true} });
    }    
}
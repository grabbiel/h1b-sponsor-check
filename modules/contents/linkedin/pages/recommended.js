class RecommendedPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.#main_pane(documentbody);
        this.#top_pane(this.mainpane);
        this.#position_placeholder(this.toppane);
        this.#job_description(this.mainpane).finally(()=>{
            this.cdescription = this.getDescription();
            new Messaging({origin: "content", operation: "submit", data:{
                description: true,
                content: this.cdescription
            }});
        });
        this.#name_placeholder(this.toppane).finally(()=>{
            this.getName().finally(()=>{
                if(this.cname != "" && this.cname != undefined && this.cname != null){
                    new Messaging({origin: "content", operation: "submit", data:{
                        name: true,
                        content: this.cname}
                    });
                }
            });
        });
    }
    #main_pane(htmlbody){
        let mainparent = htmlbody.querySelector("#main");
        this.mainpane = mainparent.querySelector("div > .jobs-search__job-details > .jobs-search__job-details--container > .jobs-details > div:not([class]) > div");
    }
    #job_description = async(mainpane) =>{
        this.descriptionholder =  mainpane.querySelector("#job-details > span");
    }
    #top_pane(mainpane){
        this.toppane =  mainpane.querySelectorAll(":scope > div:not([id]) > .jobs-unified-top-card > div")[0];
    }
    #name_placeholder = async(toppane) =>{
        this.nameholder = toppane.querySelector(".jobs-unified-top-card__company-name");
    }
    #position_placeholder(toppane){
        let positionHeaderAnchor = toppane.querySelector(":scope > [class^='jobs-unified-top-card__content'] > a");
        positionHeaderAnchor.addEventListener("click", (clickEvent)=>{
            clickEvent.stopPropagation();
        });
        this.positionholder = positionHeaderAnchor.querySelector(":scope > [class*='job']");
    }
}
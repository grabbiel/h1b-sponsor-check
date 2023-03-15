class LinkedinSearchPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.body = documentbody;

        this.#mainPane(documentbody);
        this.#topPane(this.mainpane);
        this.#positionPlaceholder(this.toppane);

        this.#jobDescription(this.mainpane).finally(()=>{
            // async submission of job description to background script
            new Messaging({origin: "content", operation: "submit", data:{
                description: true,
                content: this.getDescription()
            }});
        });

        this.#namePlaceholder(this.toppane).finally(()=>{
            this.getName().finally(()=>{
            // async submission of company name to background script
                new Messaging({origin: "content", operation: "submit", data:{
                    name: true,
                    content: this.cname}
            })});
        });
    }
    /**
     * Store main posting pane from HTML DOM tree.
     * @param HTMLDOMBody element
     * @returns void
    */
    #mainPane(htmlbody){
        var mainparent = htmlbody.querySelector("#main");
        this.mainpane = mainparent.querySelector("div > .jobs-search__job-details > .jobs-search__job-details--container > .jobs-details > div:not([class]) > div");
    }
    /**
     * Store top pane from main posting pane.
     * @param HTMLDivElement main_pane
     * @returns void
    */
    #topPane(mainpane){
        this.toppane =  mainpane.querySelectorAll(":scope > div:not([id]) > .jobs-unified-top-card > div")[0];
    }
    /**
     * Store job description container from main posting pane.
     * @param HTMLDivElement main_pane
     * @returns void
    */
    #jobDescription = async(mainpane) =>{
        this.descriptionholder =  mainpane.querySelector("#job-details > span");
    }
    /**
     * Store company name's container from top posting pane.
     * @param HTMLDivElement top_pane
     * @returns void
    */
    #namePlaceholder = async(toppane) =>{
        this.nameholder = toppane.querySelector(".jobs-unified-top-card__company-name");
    }
    /**
     * Store job title container from top posting pane.
     * @param HTMLDivElement top_pane
     * @returns void
    */
    #positionPlaceholder(toppane){
        let positionHeaderAnchor = toppane.querySelector(":scope > [class^='jobs-unified-top-card__content'] > a");
        // disable click propagation within job title container
        positionHeaderAnchor.addEventListener("click", (clickEvent)=>{
            clickEvent.stopPropagation();
        });
        this.positionholder = positionHeaderAnchor.querySelector(":scope > [class*='job']");
    }
}
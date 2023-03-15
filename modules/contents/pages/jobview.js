class LinkedinViewPage extends PageManipulation{
    constructor(documentbody){
        super();

        this.#mainPane(documentbody);
        this.#topPane(this.mainpane);
        this.#positionPlaceholder(this.toppane);

        this.#jobDescription(this.mainpane).finally(()=>{
            this.cdescription = this.getDescription();
            // async submission of job description to background script
            new Messaging({origin: "content", operation: "submit", data:{
                description: true,
                content: this.cdescription
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
        this.mainpane =  htmlbody.querySelector("[role='main']");
    }
    /**
     * Store top pane from main posting pane.
     * @param HTMLDivElement main_pane
     * @returns void
    */
    #topPane(mainpane){
        this.toppane =  mainpane.querySelector("div:not([class]) > div > div > .p5");
    }
    /**
     * Store job title container from top posting pane.
     * @param HTMLDivElement top_pane
     * @returns void
    */
    #positionPlaceholder(toppane){
        this.placeholder = toppane.querySelector("h1");
        this.positionholder = this.placeholder;
    }
    /**
     * Store job description container from main posting pane.
     * @param HTMLDivElement main_pane
     * @returns void
    */
    #jobDescription = async(mainpane) =>{
        this.descriptionholder = mainpane.querySelector("[class*='jobs-description'] > article > div > [class*='content'] > span");
    }
    /**
     * Store company name's container from top posting pane.
     * @param HTMLDivElement top_pane
     * @returns void
    */
    #namePlaceholder = async(toppane) =>{
        this.nameholder =  toppane.querySelector("[class*='company-name'] > a");
    }
}
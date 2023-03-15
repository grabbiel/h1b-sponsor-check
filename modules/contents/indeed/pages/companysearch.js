class IndeedCompanyPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.body = documentbody;

        this.#position_placeholder();

        this.#jobDescription().then(()=>{
            // async submission of job description to background script
            new Messaging({origin: "content", operation: "submit", data: {
                description: true,
                content: this.getDescription()
        }})});

        this.#namePlaceholder().then(()=>{
            // async submission of company name to background script
            this.getName().then(()=>{
                new Messaging({origin: "content", operation: "submit", data:{
                    name: true,
                    content: this.cname
        }})})});
    }
    /**
     * Store job title container from document body. Adds "flex" to display styling within container.
     * @param void
     * @returns void
    */
    #position_placeholder(){
        this.positionholder = this.body.querySelector("[data-testid = 'jobDetailTitle'] > span");
        this.positionholder.style.display = "flex";
    }
    /**
     * Store job description container from document body.
     * @param void
     * @returns void
    */
    #jobDescription = async() =>{
        this.descriptionholder = this.body.querySelector(".JobDetailDescriptionScrollable");
    }
    /**
     * Store company name's container from document body. Adds "flex" to display styling.
     * @param void
     * @returns void
    */
    #namePlaceholder = async() =>{
        this.nameholder = this.body.querySelector("[itemprop = 'name']");
        this.nameholder.style.display = "flex";
    }

}   
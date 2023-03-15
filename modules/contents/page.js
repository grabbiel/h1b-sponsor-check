class PageManipulation{
    constructor(){
        
        this.mainpane = null;
        this.toppane = null;

        this.positionholder = null;

        this.descriptionholder = null;

        this.nameholder = null;
        this.cname = null;
    }
    /**
     * Creates badge placed next to job title
     * @param void
     * @returns void
    */
    classify_position(classification){
        new PostingBadge(this.positionholder, classification);
    }
    /**
     * Creates badge placed next to company name
     * @param void
     * @returns void
    */
    classify_company(companystatus){
        new CompanyBadge(this.nameholder, companystatus);
    }
    /**
     * Retrieve text from job description container.
     * @param void
     * @returns String
    */
    getDescription(){
        return this.descriptionholder.innerText;
    }
    /**
     * Retrieve text from company name placeholder and stores it into object's company name attribute
     * @param void
     * @returns void
    */
    getName = async() =>{
        this.cname = this.nameholder.innerText.trim();
    }
}
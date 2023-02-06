class PageManipulation extends PageManipulationMethods{
    constructor(){
        super();
        this.mainpane = null;
        this.toppane = null;
        this.positionholder = null;
        this.descriptionholder = null;
        this.nameholder = null;
        this.cname = null;
    }
    classify_position(classification){
        new PostingBadge(this.positionholder, classification);
    }
    classify_company(companystatus){
        new CompanyBadge(this.nameholder, companystatus);
    }
    getDescription(){
        return this.descriptionholder.innerText;
    }
    getName = async() =>{
        this.cname = this.nameholder.innerText.trim();        
    }
}
class PageManipulation{
    constructor(){
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
class SlotPage extends PageManipulation{
    constructor(documentbody, page){
        super();
        this.positionholder = find_slot(documentbody, page, "jobTitle");
        this.descriptionholder = find_slot(documentbody, page, "description");
        this.nameholder = find_slot(documentbody, page, "companyName");
        this.cname = this.nameholder?.innerText.trim() ?? "";
    }
    submit(){
        if(this.descriptionholder !== null){
            new Messaging({origin: "content", operation: "submit", data:{
                description: true,
                content: this.getDescription()
            }});
        }
        if(this.cname !== ""){
            new Messaging({origin: "content", operation: "submit", data:{
                name: true,
                content: this.cname
            }});
        }
    }
}

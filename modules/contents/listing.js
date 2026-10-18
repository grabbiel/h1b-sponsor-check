class PostingsListing{
    constructor(documentbody, page){
        this.cards = find_slot_all(documentbody, page, "listingCompanyName").filter((card) => !card.querySelector("svg"));
        this.activecard = this.#active_card(documentbody, page);
        new Messaging({origin: "content", operation: "submit", data:{
            posts: true,
            content: this.cards.map((card, index) => ({name: card.innerText.trim(), index: index}))
        }});
    }
    #active_card(documentbody, page){
        const active = find_slot(documentbody, page, "activeListing");
        const name = active === null ? null : find_slot(active, page, "listingCompanyName");
        return name ?? this.cards[0] ?? null;
    }
    addListingBadge(companyStatus, index){
        new CompanyBadge(this.cards[index], companyStatus);
    }
    getActiveCompanyName(){
        return this.activecard?.innerText.trim() ?? "";
    }
}

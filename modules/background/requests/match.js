import Requests from "./types.js";
export default class MatchRequest extends Requests{
    constructor(company_name){
        super();
        this.string_literal = null;
        this.name_array = this.#splitCompanyName(company_name);
        this.arr_len = this.name_array.length;
    }
    /**
     * Split company name into array based on white spaces
     * @param String company_name
     * @returns String[]
    */
    #splitCompanyName(company_name){
        return company_name.includes(" ")?company_name.split(" "):[company_name];
    }
    /**
     * Loop through array of strings from company name, query for sponsoring history per string combination
     * @param void
     * @returns int
    */
    getMatch = async() => {
        return this.#loopForMatch(0).then(
            (response)=>{return response;}
        );    /* let submit be for (1) ORM or (2) DB or (3) PHP */
    }
    /**
     * Called by JobsListing object to loop trough company name array, querying for sponsoring history per string combination
     * @param void
     * @returns int
    */
    hasMatch = async() =>{
        return this.#loopForBoolean(0).then(
            (response)=>{return response;}
        );
    }
    /**
     * Recursively calls each string combination from company name to query for sponsoring history.
     * @param int index
     * @returns int
    */
    #loopForBoolean = async(cutoff) =>{
        if(this.arr_len == cutoff){ return 0; }
        return this.findCompanyMatch(this.name_array.slice(0, this.arr_len - cutoff).join(" ")).
        then((a)=>{
            if(Boolean(a)){return a;}
            return this.#loopForBoolean(cutoff+1);
        });
    }
    /**
     * Recursively calls each string combination from company name to query for sponsoring history. Each call stores the string literal
     * @param int index
     * @returns int
    */
    #loopForMatch = async (cutoff) =>{
        if(this.arr_len === cutoff){ return 0; }
        this.string_literal = this.name_array.slice(0, this.arr_len - cutoff).join(" ");
        return this.findCompanyMatch(this.string_literal).then(
            (a)=>{
                if(Boolean(a)){ return a;}
                return this.#loopForMatch(cutoff+1);
        });
    }
}

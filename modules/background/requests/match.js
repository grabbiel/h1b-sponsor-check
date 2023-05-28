import Requests from "./types.js";
export default class MatchRequest extends Requests{
    constructor(company_name){
        super();
        this.main_name = company_name;
        this.string_literal = null;
        this.name_array = this.#splitCompanyName(company_name);
        this.arr_len = this.name_array.length;
    }
    #splitCompanyName(company_name){
        return company_name.includes(" ")?company_name.split(" "):[company_name];
    }
    get_match = async() => {
        return this.#loop_for_match(0).then(
            (response)=>{return response;}
        );    /* let submit be for (1) ORM or (2) DB or (3) PHP */
    }
    has_match = async() =>{
        return this.#loop_for_boolean(0).then(
            (response)=>{return response;}
        );
    }
    #loop_for_boolean = async(cutoff) =>{
        if(this.arr_len == cutoff){ return 0; }
        return this.findCompanyMatch(this.name_array.slice(0, this.arr_len - cutoff).join(" ")).
        then((a)=>{
            if(Boolean(a)){return a;}
            return this.#loop_for_boolean(cutoff+1);
        });
    }
    #loop_for_match = async (cutoff) =>{
        if(this.arr_len === cutoff){ return 0; }
        this.string_literal = this.name_array.slice(0, this.arr_len - cutoff).join(" ");
        return this.findCompanyMatch(this.string_literal).then(
            (a)=>{
                if(Boolean(a)){ return a;}
                return this.#loop_for_match(cutoff+1);
        });
    }
}

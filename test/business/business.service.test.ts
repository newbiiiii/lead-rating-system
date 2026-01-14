
import {getDynamicRatingContext, getBusinessContext} from "../../src/services/business.service";
import 'dotenv/config';

// console.log(getDynamicRatingContext('wall panel'))
console.log(getBusinessContext('wall panel')?.business)
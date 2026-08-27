import dayjs from "dayjs";
import type { Stay } from "../types";
import { nightsOf } from "./stats";

/**
 * 「再住一次」：以一条已有记录为模板生成新记录的初值。
 *
 * 保留酒店身份与偏好（名称/集团/子品牌/城市/坐标/房型/房价/标签），
 * 清空这一趟独有的东西（评分/备注/积分），日期挪到今天起、沿用原晚数。
 * 返回的是完整 Stay（带新 uuid），交给 StayForm 当 initial 使用。
 */
export function repeatDraft(src: Stay): Stay {
  const nights = nightsOf(src);
  const checkIn = dayjs().format("YYYY-MM-DD");
  return {
    id: crypto.randomUUID(),
    hotelName: src.hotelName,
    hotelNameEn: src.hotelNameEn,
    brand: src.brand,
    group: src.group,
    customGroupName: src.customGroupName,
    city: src.city,
    country: src.country,
    lat: src.lat,
    lng: src.lng,
    checkIn,
    checkOut: dayjs(checkIn).add(nights, "day").format("YYYY-MM-DD"),
    roomType: src.roomType,
    rate: src.rate,
    currency: src.currency,
    tags: src.tags ? [...src.tags] : undefined,
    // 刻意不带：pointsEarned / pointsRedeemed / rating / notes / updatedAt
  };
}

import * as React from "react"

import { cn } from "@/lib/utils"

const BASE = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

// YYYY-MM-DD → DD/MM/YYYY بأرقام لاتينية
const toDisplay = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "")
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ""
}

// حقل التاريخ: بعض المتصفحات (خصوصًا أندرويد بالعربي) تعرض نص الحقل الأصلي برموز مشوّهة
// مثل «موي/رهش/ةنس». نُخفي نص المتصفح ونرسم التاريخ بأنفسنا بالأرقام، ويبقى منتقي التاريخ الأصلي يعمل.
const DateInput = React.forwardRef(({ className, value, defaultValue, onChange, placeholder, style, ...props }, ref) => {
  const [inner, setInner] = React.useState(value ?? defaultValue ?? "")
  const current = value !== undefined ? value : inner
  // عرض الحقل (w-*) ينتقل للغلاف حتى يحافظ على التخطيط
  const widthCls = (className || "").split(/\s+/).filter((c) => /^(w-|min-w-|max-w-|flex-1|sm:w-|md:w-|lg:w-)/.test(c)).join(" ")
  // لون النص من كلاسات الحقل (مثل text-white في الوضع الداكن)
  const colorCls = (className || "").split(/\s+/).filter((c) => /^(dark:)?text-(white|black|slate|gray|zinc|neutral|emerald|amber|red|blue)/.test(c)).join(" ")
  const text = toDisplay(current)
  return (
    <div className={cn("relative", widthCls || "w-full")}>
      <input
        type="date"
        ref={ref}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={(e) => { setInner(e.target.value); onChange?.(e) }}
        className={cn(BASE, className, "w-full date-input-native")}
        style={{ ...style, color: "transparent" }}
        {...props} />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 right-3 flex items-center text-base md:text-sm",
          text ? colorCls : "text-muted-foreground opacity-70"
        )}
        dir="ltr"
      >
        {text || placeholder || "يوم / شهر / سنة"}
      </span>
    </div>
  )
})
DateInput.displayName = "DateInput"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  if (type === "date") return <DateInput ref={ref} className={className} {...props} />
  return (
    <input
      type={type}
      className={cn(BASE, className)}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/utils/cn"

// Map a limited set of responsive hidden classes to their block counterparts.
// Kept explicit so Tailwind can tree-shake and still generate the classes.
const hiddenToBlock = (cls?: string) => {
  switch (cls) {
    case "sm:hidden":
      return "sm:block"
    case "md:hidden":
      return "md:block"
    case "lg:hidden":
      return "lg:block"
    case "xl:hidden":
      return "xl:block"
    case "2xl:hidden":
      return "2xl:block"
    default:
      return ""
  }
}

type CollapsibleContextValue = {
  isCollapsible: boolean
  collapsed: boolean
  toggle: () => void
  disableCollapsibleOn?: string
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null)

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  isCollapsible?: boolean
  defaultCollapsed?: boolean
  disableCollapsibleOn?: string // Tailwind responsive classes like "md:hidden", "lg:hidden", etc.
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, isCollapsible = false, defaultCollapsed = true, disableCollapsibleOn, ...props }, ref) => {
    const [collapsed, setCollapsed] = React.useState<boolean>(
      isCollapsible ? defaultCollapsed : false
    )

    // Sync collapsed state when isCollapsible becomes true (e.g., after loading state)
    const prevIsCollapsible = React.useRef(isCollapsible)
    React.useEffect(() => {
      if (isCollapsible && !prevIsCollapsible.current) {
        setCollapsed(defaultCollapsed)
      }
      prevIsCollapsible.current = isCollapsible
    }, [isCollapsible, defaultCollapsed])

    return (
      <CollapsibleContext.Provider value={{
        isCollapsible,
        collapsed,
        toggle: () => setCollapsed((c) => !c),
        disableCollapsibleOn
      }}>
        <div
          ref={ref}
          className={cn(
            "bg-white rounded-lg border text-card-foreground shadow-sm",
            className
          )}
          {...props}
        />
      </CollapsibleContext.Provider>
    )
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(CollapsibleContext)

  return (
    <div
      ref={ref}
      className={cn(
        ctx?.isCollapsible
          ? "flex flex-row items-center justify-between px-4 py-4"
          : "flex flex-col space-y-1.5 px-4 py-4",
        className
      )}
      {...props}
    >
      {children}
      {ctx?.isCollapsible && (
        <button
          type="button"
          onClick={ctx.toggle}
          aria-expanded={!ctx.collapsed}
          aria-label={ctx.collapsed ? "Expand" : "Collapse"}
          className={cn(
            "ml-2 rounded-md p-1 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2 transition-colors flex-shrink-0",
            ctx.disableCollapsibleOn
          )}
        >
          <ChevronDown className={cn("h-5 w-5 transition-transform", ctx.collapsed ? "rotate-0" : "rotate-180")} />
        </button>
      )}
    </div>
  )
})
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(CollapsibleContext)
  const disableClass = ctx?.disableCollapsibleOn
  const showClass = hiddenToBlock(disableClass)

  // If collapsed and no disable override, hide entirely
  if (ctx?.isCollapsible && ctx.collapsed && !disableClass) return null

  // If collapsed with disable override, keep node hidden on small, shown on breakpoint+
  const collapsedClasses = ctx?.isCollapsible && ctx.collapsed ? "hidden" : ""

  return (
    <div
      ref={ref}
      className={cn("p-4 pt-0", collapsedClasses, showClass, className)}
      {...props}
    >
      {children}
    </div>
  )
})
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(CollapsibleContext)
  const disableClass = ctx?.disableCollapsibleOn
  const showClass = hiddenToBlock(disableClass)

  if (ctx?.isCollapsible && ctx.collapsed && !disableClass) return null

  const collapsedClasses = ctx?.isCollapsible && ctx.collapsed ? "hidden" : ""

  return (
    <div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", collapsedClasses, showClass, className)}
      {...props}
    >
      {children}
    </div>
  )
})
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

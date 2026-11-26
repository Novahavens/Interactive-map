"use client";

import { ChevronDown, MessageSquare } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TEMPLATE_MENU, menuText, type TemplateContext } from "@/lib/phone-lookup-ui";
import { quoMessageUrl } from "@/lib/quo-links";
import { cn } from "@/lib/utils";

/**
 * The Text button as a menu of ready-made texts (feature `templates`). Each entry is the same Quo link the
 * plain Text button is, with that text as the draft; `onOpen` is ContactActions' own Text handler, so the
 * laptop behaviour (number copied, "Quo didn't open" hints) is the one code path. Nothing is sent from here.
 */
export default function TextTemplates({
  number,
  shown,
  name,
  address,
  from,
  context,
  className,
  onOpen,
}: {
  /** E.164. */
  number: string;
  /** The number as shown on screen, for the button's name. */
  shown: string;
  /** The contact's name, for the greeting. */
  name: string | null;
  address: string | null;
  /** The teammate's name remembered on this device. */
  from: string;
  context?: TemplateContext;
  /** The Call button's classes, so the two match. */
  className: string;
  onOpen: (number: string, shown: string) => void;
}) {
  const opts = { to: name, address, from, ...context };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Links are blue here (globals.css), so Call is; the menu button takes the same ink to sit beside it. */}
        <button type="button" className={cn(className, "text-brand hover:text-[var(--focus-hover)]")} data-quo="text" aria-label={`Text ${shown} with Quo`}>
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          Text
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={`Text ${shown}`} className="w-[min(20rem,calc(100vw-24px))] rounded-[10px] border-line2 bg-surface p-1">
        {TEMPLATE_MENU.map(({ key, label }) => {
          const text = menuText(key, opts);
          return (
            <div key={key} className="contents">
              {key === "blank" && <DropdownMenuSeparator className="bg-line" />}
              <DropdownMenuItem asChild className="cursor-pointer flex-col items-stretch gap-0 rounded-md px-2.5 py-1.5 leading-snug [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:justify-center">
                <a href={quoMessageUrl(number, text)} onClick={() => onOpen(number, shown)} data-quo-template={key} className="text-ink! no-underline focus-visible:-outline-offset-2">
                  <span className="text-[13px] font-medium">{label}</span>
                  {text && <span className="truncate text-xs text-muted">{text.trim()}</span>}
                </a>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

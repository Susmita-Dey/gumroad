import * as React from "react";

import { assertDefined } from "$app/utils/assert";
import { assertResponseError, request, ResponseError } from "$app/utils/request";

import { NavigationButton } from "$app/components/Button";
import { useAppDomain } from "$app/components/DomainSettings";
import { Icon } from "$app/components/Icons";
import {
  Product,
  ProductDiscount,
  Purchase,
  RatingsSummary,
  useSelectionFromUrl,
  Props as ProductProps,
  getStandalonePrice,
} from "$app/components/Product";
import {
  applySelection,
  ConfigurationSelectorHandle,
  PriceSelection,
} from "$app/components/Product/ConfigurationSelector";
import { CtaButton } from "$app/components/Product/CtaButton";
import { PriceTag } from "$app/components/Product/PriceTag";
import {
  Action,
  AddSectionButton,
  PageProps as EditSectionsProps,
  EditSection,
  Section as EditableSection,
  ReducerContext as SectionReducerContext,
  useSectionImageUploadSettings,
} from "$app/components/Profile/EditSections";
import { Section, PageProps as SectionsProps } from "$app/components/Profile/Sections";
import { ImageUploadSettingsContext } from "$app/components/RichTextEditor";
import { showAlert } from "$app/components/server-components/Alert";
import { useIsAboveBreakpoint } from "$app/components/useIsAboveBreakpoint";
import { useRefToLatest } from "$app/components/useRefToLatest";
import { WithTooltip } from "$app/components/WithTooltip";

export type Props = ProductProps & { main_section_index: number } & (SectionsProps | EditSectionsProps);

const SectionEditor = ({
  props,
  children,
}: {
  props: Extract<Props, EditSectionsProps>;
  children: React.ReactNode;
}) => {
  const { product } = props;
  const [sections, setSections] = React.useState(() => {
    const sections = [...props.sections];
    // fake section (never rendered) to make things easier
    sections.splice(props.main_section_index, 0, {
      type: "SellerProfileFeaturedProductSection",
      id: "",
      featured_product_id: product.id,
      header: "",
      hide_header: true,
    });
    return sections;
  });

  const saveSections = async (sections: EditableSection[]) => {
    setSections(sections);
    const order = sections.map((section) => section.id);
    const mainIndex = order.findIndex((id) => !id);
    order.splice(mainIndex, 1);
    try {
      const response = await request({
        method: "PUT",
        url: Routes.sections_link_path(product.permalink),
        accept: "json",
        data: { sections: order, main_section_index: mainIndex },
      });
      if (!response.ok) throw new ResponseError();
      showAlert("Changes saved!", "success");
    } catch (e) {
      assertResponseError(e);
      showAlert(e.message, "error");
    }
  };

  const sectionsRef = useRefToLatest(sections);
  const dispatch = (action: Action) => {
    const sections = sectionsRef.current;
    switch (action.type) {
      case "add-section": {
        action.section.then((section) => {
          const newSections = [...sections];
          newSections.splice(action.index, 0, section);
          void saveSections(newSections);
        }, assertResponseError);
        break;
      }
      case "update-section": {
        setSections(sections.map((section) => (section.id === action.updated.id ? action.updated : section)));
        break;
      }
      case "remove-section": {
        void saveSections(sections.filter((section) => section.id !== action.id));
        break;
      }
      case "move-section-up":
      case "move-section-down": {
        const index = sections.findIndex((section) => section.id === action.id);
        const updatedSections = [...sections];
        const [section] = updatedSections.splice(index, 1);
        updatedSections.splice(index + (action.type === "move-section-up" ? -1 : 1), 0, assertDefined(section));
        void saveSections(updatedSections);
      }
    }
  };
  const reducer = React.useMemo(() => [{ ...props, sections, product_id: product.id }, dispatch] as const, [sections]);
  const imageUploadSettings = useSectionImageUploadSettings();

  return (
    <SectionReducerContext.Provider value={reducer}>
      <ImageUploadSettingsContext.Provider value={imageUploadSettings}>
        {sections.map((section, i) => (
          <section key={section.id} id={section.id}>
            <AddSectionButton index={i} />
            {section.id ? <EditSection section={section} /> : children}
            {i === sections.length - 1 ? <AddSectionButton index={i + 1} position="top" /> : null}
          </section>
        ))}
      </ImageUploadSettingsContext.Provider>
    </SectionReducerContext.Provider>
  );
};

export const Layout = (
  props: Props & {
    cart?: boolean;
    hasHero?: boolean;
  },
) => {
  const { product, purchase, discount_code: discountCode, cart, hasHero, wishlists, main_section_index } = props;
  const [selection, setSelection] = useSelectionFromUrl(product);
  const ctaButtonRef = React.useRef<HTMLAnchorElement>(null);
  const ctaLabel = cart ? "Add to cart" : undefined;

  const configurationSelectorRef = React.useRef<ConfigurationSelectorHandle>(null);

  const productView = (
    <>
      <EditButton product={product} />
      <Product
        product={product}
        purchase={purchase}
        discountCode={discountCode ?? null}
        ctaLabel={ctaLabel}
        selection={selection}
        setSelection={setSelection}
        ctaButtonRef={ctaButtonRef}
        configurationSelectorRef={configurationSelectorRef}
        wishlists={wishlists}
      />
    </>
  );

  const mainSection = <section>{productView}</section>;

  return (
    <>
      <CtaBar
        product={product}
        purchase={purchase}
        discountCode={discountCode ?? null}
        ctaLabel={ctaLabel}
        selection={selection}
        ctaButtonRef={ctaButtonRef}
        configurationSelectorRef={configurationSelectorRef}
        hasHero={!!hasHero}
      />
      {"products" in props ? (
        <SectionEditor props={props}>{productView}</SectionEditor>
      ) : props.sections.length > 0 ? (
        props.sections.map((section, i) => (
          <React.Fragment key={section.id}>
            {i === main_section_index ? mainSection : null}
            <Section section={section} {...props} />
            {main_section_index >= props.sections.length && i === props.sections.length - 1 ? mainSection : null}
          </React.Fragment>
        ))
      ) : (
        mainSection
      )}
    </>
  );
};

const CtaBar = ({
  product,
  purchase,
  discountCode,
  ctaButtonRef,
  configurationSelectorRef,
  ctaLabel,
  selection,
  hasHero,
}: {
  product: Product;
  purchase: Purchase | null;
  discountCode?: ProductDiscount | null;
  ctaButtonRef: React.RefObject<HTMLAnchorElement>;
  configurationSelectorRef: React.RefObject<ConfigurationSelectorHandle>;
  ctaLabel?: string | undefined;
  selection: PriceSelection;
  hasHero: boolean;
}) => {
  const selectionAttributes = applySelection(product, discountCode?.valid ? discountCode.discount : null, selection);
  let { priceCents } = selectionAttributes;
  const { discountedPriceCents, isPWYW, hasRentOption, hasMultipleRecurrences, hasConfigurableQuantity } =
    selectionAttributes;

  const [visible, setVisible] = React.useState(false);
  const ref = React.useRef<null | HTMLDivElement>(null);
  const isDesktop = useIsAboveBreakpoint("lg");

  React.useEffect(() => {
    if (!ctaButtonRef.current) return;
    new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // @ts-expect-error: Fixes issue on Safari where the page gets scrolled up/down by the height of the CTA bar when it disappears/appears, resulting on an infinite loop of the CTA bar being shown/hidden.
        if (window.safari !== undefined && isDesktop) {
          const main = document.querySelector("main");
          if (ref.current && ctaButtonRef.current && main && entry.rootBounds) {
            if (entry.boundingClientRect.top < main.getBoundingClientRect().top)
              // We use 1.9 here (instead of 2) because it empirically does a better job of eliminating
              // the infinite scroll jumping described above.
              main.scrollBy(0, ((entry.isIntersecting ? -1 : 1) * entry.boundingClientRect.height) / 1.9);
          }
        }

        setVisible(!entry.isIntersecting);
      },
      { threshold: 0.5 },
    ).observe(ctaButtonRef.current);
  }, [ctaButtonRef.current]);

  const height = ref.current?.getBoundingClientRect().height ?? 0;

  if (product.bundle_products.length) priceCents = getStandalonePrice(product);

  return (
    <section
      aria-label="Product information bar"
      style={{
        overflow: "hidden",
        padding: 0,
        border: "none",
        height: visible ? height : 0,
        transition: "var(--transition-duration)",
        flexShrink: 0,
        order: isDesktop ? undefined : 1,
        boxShadow: visible
          ? "0 var(--border-width) rgb(var(--color)), 0 calc(-1 * var(--border-width)) rgb(var(--color))"
          : undefined,
        position: "sticky",
        top: isDesktop ? 0 : undefined,
        bottom: isDesktop ? undefined : 0,
        // Render above the product edit button
        zIndex: "var(--z-index-menubar)",
        marginTop: hasHero ? "var(--border-width)" : undefined,
      }}
    >
      <div
        ref={ref}
        className="product-cta"
        style={{
          transition: "var(--transition-duration)",
          marginTop: visible || !isDesktop ? undefined : -height,
        }}
      >
        <PriceTag
          currencyCode={product.currency_code}
          oldPrice={discountedPriceCents < priceCents ? priceCents : undefined}
          price={discountedPriceCents}
          url={product.long_url}
          recurrence={
            product.recurrences
              ? {
                  id: selection.recurrence ?? product.recurrences.default,
                  duration_in_months: product.duration_in_months,
                }
              : undefined
          }
          isPayWhatYouWant={isPWYW}
          isSalesLimited={product.is_sales_limited}
          creatorName={product.seller?.name}
        />
        <h3>{product.name}</h3>
        {product.ratings != null && product.ratings.count > 0 ? <RatingsSummary ratings={product.ratings} /> : null}
        <CtaButton
          product={product}
          purchase={purchase}
          discountCode={discountCode ?? null}
          selection={selection}
          label={ctaLabel}
          onClick={(evt) => {
            if (
              isPWYW ||
              product.options.length > 1 ||
              hasRentOption ||
              hasMultipleRecurrences ||
              hasConfigurableQuantity
            ) {
              evt.preventDefault();
              ctaButtonRef.current?.scrollIntoView(false);
              configurationSelectorRef.current?.focusRequiredInput();
              if (isPWYW && selection.price.value === null) showAlert("You must input an amount", "warning");
            }
          }}
        />
      </div>
    </section>
  );
};

const EditButton = ({ product }: { product: Product }) => {
  const appDomain = useAppDomain();

  if (!product.can_edit) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "var(--spacer-3)",
        left: "var(--spacer-3)",
        // Render above the product `article`
        zIndex: "var(--z-index-overlay)",
      }}
    >
      <WithTooltip tip="Edit product" position="right">
        <NavigationButton
          color="filled"
          href={Routes.edit_link_url({ id: product.permalink }, { host: appDomain })}
          aria-label="Edit product"
        >
          <Icon name="pencil" />
        </NavigationButton>
      </WithTooltip>
    </div>
  );
};

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@sparkyidea/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sparkyidea/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sparkyidea/ui/components/form";
import { Input } from "@sparkyidea/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusCircleIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTRPC } from "@/lib/utils/trpc/client";
import { inToMm, ozToMg } from "@/lib/utils/unit-conversion";

const formSchema = z.object({
  price: z.number().min(0, "Price must be positive"),
  sku: z.string().optional(),
  weightOz: z.number().min(0, "Weight must be positive"),
  lengthIn: z.number().min(0, "Length must be positive"),
  widthIn: z.number().min(0, "Width must be positive"),
  heightIn: z.number().min(0, "Height must be positive"),
  attributes: z.array(
    z.object({
      key: z.string().min(1, "Name is required"),
      value: z.string().min(1, "Value is required"),
    })
  ),
});

type FormValues = z.infer<typeof formSchema>;

export function AddVariantsDialog({
  productId,
  label = "Add options like size or color",
}: {
  productId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      price: 0,
      sku: "",
      weightOz: 0,
      lengthIn: 0,
      widthIn: 0,
      heightIn: 0,
      attributes: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "attributes",
  });

  const { mutate, isPending } = useMutation(
    trpc.productVariant.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Variant created");
        form.reset();
        setOpen(false);
        await queryClient.invalidateQueries({
          queryKey: trpc.product.getOne.queryKey({ id: productId }),
        });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const onSubmit = (values: FormValues) => {
    const attributesMap: Record<string, string> = {};
    for (const attr of values.attributes) {
      attributesMap[attr.key] = attr.value;
    }

    mutate({
      productId,
      price: Math.round(values.price * 100),
      sku: values.sku || null,
      weight: ozToMg(values.weightOz),
      length: inToMm(values.lengthIn),
      width: inToMm(values.widthIn),
      height: inToMm(values.heightIn),
      attributes: Object.keys(attributesMap).length > 0 ? attributesMap : null,
    });
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      form.reset();
    }
    setOpen(value);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button
            className="w-full justify-start text-muted-foreground"
            size="sm"
            variant="ghost"
          />
        }
      >
        <PlusCircleIcon className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Variant</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="font-medium text-sm">Attributes</span>
                {fields.map((field, index) => (
                  <div className="flex items-end gap-2" key={field.id}>
                    <FormField
                      control={form.control}
                      name={`attributes.${index}.key`}
                      render={({ field: f }) => (
                        <FormItem className="flex-1">
                          {index === 0 && <FormLabel>Name</FormLabel>}
                          <FormControl>
                            <Input placeholder="e.g. Color" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`attributes.${index}.value`}
                      render={({ field: f }) => (
                        <FormItem className="flex-1">
                          {index === 0 && <FormLabel>Value</FormLabel>}
                          <FormControl>
                            <Input placeholder="e.g. Red" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      onClick={() => remove(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  className="w-fit"
                  onClick={() => append({ key: "", value: "" })}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PlusIcon className="mr-1 size-4" />
                  Add attribute
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price ($)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          step="0.01"
                          type="number"
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="weightOz"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight (oz)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        step="0.01"
                        type="number"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="lengthIn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Length (in)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          step="0.01"
                          type="number"
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="widthIn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Width (in)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          step="0.01"
                          type="number"
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="heightIn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Height (in)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          step="0.01"
                          type="number"
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button disabled={isPending} type="submit">
                {isPending ? "Creating..." : "Create variant"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

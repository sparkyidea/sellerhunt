# Implement the scan listing page design and profit calculator

## Problem

The scan listing page needs its intended design implemented and a calculator that lets a user enter any two of cost, selling price, and profit to determine the third. The design reference and the financial meaning of these inputs are not specified in the todo.

Without agreed definitions for profit and included expenses, the calculator's results would be ambiguous and could mislead a user evaluating a listing.

## Expected outcome

- The scan listing page matches the agreed design reference.
- Cost plus target profit produces the required selling price.
- Cost plus selling price produces profit.
- Target profit plus selling price produces the maximum purchase cost.
- Labels and results make the agreed meaning of cost, profit, and included expenses clear.
- All three modes handle invalid and incomplete inputs predictably.

## Details to clarify

- What is the design reference, and does it apply to the listing list, detail page, preview, or more than one view?
- Is profit a currency amount, a percentage, or both? If a percentage, what is its basis?
- Does cost mean purchase price alone or total cost including other expenses?
- Which marketplace fees, shipping costs, taxes, and other expenses belong in the calculation, and who provides them?
- Which currency and rounding rules should apply?
- What should happen when all three values are entered, or when a result is negative or impossible?

Resolve the input definitions before implementing formulas. This issue does not prescribe formulas, page layout, or technical implementation.

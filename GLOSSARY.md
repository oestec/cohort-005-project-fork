# Cadence

An online course platform where learners buy courses and can ask for their money back.

## Language

### People

**Learner**:
A person who buys and takes a course.
_Avoid_: Student, customer, user

### Refunds

**Refund**:
The return of a purchase's full Refundable Amount to the Learner. There are no partial Refunds.
_Avoid_: Reversal, Chargeback, Cancellation

**Refund Request**:
A Learner's ask for a Refund on one purchase, which Cadence approves or declines. A purchase can have at most one Refund Request.
_Avoid_: Reversal request, chargeback, cancellation

**Open**:
The state of a Refund Request that is waiting to be reviewed: it has been neither approved nor declined.
_Avoid_: Pending, requested, raised

**Approved**:
The state of a Refund Request that Cadence has accepted, which results in a Refund and ends the Learner's access to the course.
_Avoid_: Accepted, processed, done

**Declined**:
The state of a Refund Request that Cadence has turned down. No money is returned.
_Avoid_: Rejected, denied

**Refundable Amount**:
The amount the Learner actually paid for the purchase, which is what a Refund returns.
_Avoid_: List price, course price

**Refund Window**:
The 14 calendar days from the day of purchase, inclusive of the fourteenth day, during which a Refund Request can be made.
_Avoid_: Cancel window, cooling-off period

**Refund Eligibility**:
Whether a purchase may have a Refund Request made against it: it is inside the Refund Window, has no earlier Refund Request, is not a claimed team seat, and the Learner has watched under 2 hours and completed under half of the course's lessons.
_Avoid_: Cancellation offer, refundable

**Chargeback**:
A payment dispute a Learner raises with their card issuer, outside Cadence. It is never a Refund.
